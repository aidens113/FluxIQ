// What the same bytes cost when they are sent again.
//
// Every decision of an evidence loop is a fresh, stateless request carrying the
// same node catalog, the same tool descriptions, the same decision grammar and
// the same instruction. A provider's context cache is the only thing standing
// between that and paying full price for all of it on every call, and a cache
// matches a *prefix* -- so the whole saving turns on one question: does a value
// that changes per call sit in front of material that does not?
//
// It did. `evidenceLoop.iteration`, a counter, sat at byte 6,499 of a
// 50,840-byte message and stranded 20,341 identical bytes behind it. These
// tests hold the order to the rule that fixes it, and hold the adapter to
// reading back what the provider says it cached, because without that figure
// nobody can tell whether any of this worked.

import { describe, expect, it } from "vitest";
import { createAutomationStudioDeepSeekProvider } from "../deepseek/index.ts";
import {
  AUTOMATION_STUDIO_DEEPSEEK_PEAK_CACHE_HIT_INPUT_USD_PER_MILLION_TOKENS,
  AUTOMATION_STUDIO_DEEPSEEK_PEAK_CACHE_MISS_INPUT_USD_PER_MILLION_TOKENS,
  AUTOMATION_STUDIO_DEEPSEEK_PEAK_OUTPUT_USD_PER_MILLION_TOKENS,
  estimateAutomationStudioDeepSeekCostUsd
} from "../deepseek/index.ts";
import { buildAutomationStudioLlmEvidenceLoopDecisionSchema } from "../evidence-loop.ts";
import type { AutomationStudioLlmTaskRequest } from "../harness.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA, type AutomationStudioFlowBootstrapCatalogEntry } from "../../flow-bootstrap/index.ts";

const tools = [
  { toolId: "core.run_node", description: "Run one node from the library against the page, with the parameters this call names.", inputSchema: { type: "object" } },
  { toolId: "core.read_draft", description: "Read the draft the build has accrued so far.", inputSchema: { type: "object" } }
];
const completionSchema = { type: "object" } as const;

describe("the order of a DeepSeek evidence-loop request", () => {
  it("leaves nothing constant behind the per-call counter: two calls over one window differ only in it", async () => {
    const first = await userMessage(loopRequest(1, evidence(3)));
    const second = await userMessage(loopRequest(2, evidence(3)));

    const shared = commonPrefixLength(first, second);
    // Identical up to the digit of the counter, and the counter is the last
    // thing in the message. That is the whole claim: the prefix is contiguous
    // and nothing that could have been reused sits behind it.
    expect(first.slice(0, shared)).toMatch(/"iteration":$/u);
    expect(first.slice(shared)).toMatch(/^\d+\}\}\}$/u);
    // Every constant part is inside it, in the order it is written.
    const offsets = ['"taskKind"', '"outputSchema"', '"instructions"', '"policyGates"', '"flowBootstrap"', '"nodeCatalog"', '"evidenceLoop"', '"tools"', '"evidence"'].map((key) => {
      const at = first.indexOf(key);
      expect(at, key).toBeGreaterThan(-1);
      expect(at, key).toBeLessThan(shared);
      return at;
    });
    expect(offsets).toEqual([...offsets].sort((left, right) => left - right));
  });

  it("keeps every part of a window that only grew, so an added result does not re-charge the ones before it", async () => {
    // The window is built in the order things happened and usually only gains
    // an entry, so on a call that evicted nothing everything before the newest
    // result is byte-for-byte what the last call carried.
    const first = await userMessage(loopRequest(1, evidence(3)));
    const second = await userMessage(loopRequest(2, evidence(4)));

    const shared = commonPrefixLength(first, second);

    // All three of the earlier results are inside the prefix; only the fourth,
    // which is new, is not.
    expect(first.indexOf('"call.3"'), "the third result").toBeLessThan(shared);
    expect(second.indexOf('"call.4"'), "the fourth result").toBeGreaterThan(shared);
    // Measured on this fixture, whose catalog and window are sized like a real
    // build's. The bounds are set below what it measures so that resizing the
    // fixture cannot make the test lie, and far enough above what the old order
    // reached -- 1,272 bytes of the same 50,711 -- that any regression fails.
    expect(shared).toBeGreaterThan(40_000);
    expect(shared / first.length).toBeGreaterThan(0.8);
  });

  it("keeps the whole constant block when only the evidence grows", async () => {
    // The catalog is the single largest item and the one a cache is worth most
    // for. It must not move when the window fills.
    const early = await userMessage(loopRequest(4, evidence(1)));
    const late = await userMessage(loopRequest(9, evidence(6)));
    const shared = commonPrefixLength(early, late);

    expect(early.indexOf('"nodeCatalog"')).toBeLessThan(shared);
    expect(early.slice(0, shared)).toContain("web.output.dom-extract_list");
  });
});

describe("what the adapter reads back about the cache", () => {
  it("reads DeepSeek's split of the input and prices the cached part at the cache-hit rate", async () => {
    const result = await runWithUsage({ prompt_tokens: 1_000, completion_tokens: 100, total_tokens: 1_100, prompt_cache_hit_tokens: 900, prompt_cache_miss_tokens: 100 });

    expect(result.usage).toEqual({
      inputTokens: 1_000,
      outputTokens: 100,
      totalTokens: 1_100,
      cacheHitInputTokens: 900,
      cacheMissInputTokens: 100,
      estimatedCostUsd: estimateAutomationStudioDeepSeekCostUsd(1_000, 100, 900)
    });
    // The point of reading it: 900 of the 1,000 input tokens cost a fiftieth
    // of what they used to, and the call is measurably cheaper for it.
    expect(result.usage.estimatedCostUsd).toBeCloseTo(0.0001554, 10);
    expect(result.usage.estimatedCostUsd).toBeLessThan(estimateAutomationStudioDeepSeekCostUsd(1_000, 100));
  });

  it("reads the split from prompt_tokens_details when that is where it is", async () => {
    const result = await runWithUsage({ prompt_tokens: 1_000, completion_tokens: 100, total_tokens: 1_100, prompt_tokens_details: { cached_tokens: 640 } });

    expect(result.usage).toMatchObject({ cacheHitInputTokens: 640, cacheMissInputTokens: 360 });
  });

  it("drops a split that does not divide the input, and prices the call as an uncached one", async () => {
    for (const usage of [
      { prompt_cache_hit_tokens: 1_200 },
      { prompt_cache_hit_tokens: 900, prompt_cache_miss_tokens: 50 },
      { prompt_cache_hit_tokens: -1 },
      { prompt_cache_hit_tokens: "900" }
    ]) {
      const result = await runWithUsage({ prompt_tokens: 1_000, completion_tokens: 100, total_tokens: 1_100, ...usage });

      expect(result.usage.cacheHitInputTokens, JSON.stringify(usage)).toBeUndefined();
      expect(result.usage.cacheMissInputTokens, JSON.stringify(usage)).toBeUndefined();
      expect(result.usage.estimatedCostUsd, JSON.stringify(usage)).toBe(estimateAutomationStudioDeepSeekCostUsd(1_000, 100));
    }
  });

  it("prices a call the provider said nothing about exactly as it did before any of this", async () => {
    const result = await runWithUsage({ prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 });

    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 5, totalTokens: 17, estimatedCostUsd: 0.0000096 });
  });

  // DeepSeek's published peak rates for deepseek-flash, per million tokens:
  // $0.006 cache-hit input, $0.3 cache-miss input, $1.2 output
  // (https://api-docs.deepseek.com/quick_start/pricing/, read 2026-09-23). The
  // constants said 0.044, 0.44 and 1.32 until then, and the hit rate was
  // written as "a tenth of a miss" from no source at all. It is a fiftieth,
  // which is what makes lengthening a cached prefix worth doing.
  it("charges a hit at a fiftieth of a miss and refuses a split that is not one", () => {
    expect(AUTOMATION_STUDIO_DEEPSEEK_PEAK_CACHE_MISS_INPUT_USD_PER_MILLION_TOKENS).toBe(0.3);
    expect(AUTOMATION_STUDIO_DEEPSEEK_PEAK_CACHE_HIT_INPUT_USD_PER_MILLION_TOKENS).toBe(0.006);
    expect(AUTOMATION_STUDIO_DEEPSEEK_PEAK_OUTPUT_USD_PER_MILLION_TOKENS).toBe(1.2);
    expect(AUTOMATION_STUDIO_DEEPSEEK_PEAK_CACHE_HIT_INPUT_USD_PER_MILLION_TOKENS * 50)
      .toBeCloseTo(AUTOMATION_STUDIO_DEEPSEEK_PEAK_CACHE_MISS_INPUT_USD_PER_MILLION_TOKENS, 10);
    expect(estimateAutomationStudioDeepSeekCostUsd(1_000, 0, 1_000)).toBe(0.000006);
    expect(estimateAutomationStudioDeepSeekCostUsd(1_000, 0, 0)).toBe(0.0003);
    expect(estimateAutomationStudioDeepSeekCostUsd(1_000, 1_000, 0)).toBe(0.0015);
    // A run that names the larger model is priced for the larger model.
    expect(estimateAutomationStudioDeepSeekCostUsd(1_000, 1_000, 0, "deepseek-v4-pro")).toBe(0.00528);
    expect(estimateAutomationStudioDeepSeekCostUsd(1_000, 0, 1_000, "deepseek-v4-pro")).toBe(0.000044);
    expect(() => estimateAutomationStudioDeepSeekCostUsd(1_000, 0, 1_001)).toThrow(RangeError);
    expect(() => estimateAutomationStudioDeepSeekCostUsd(1_000, 0, -1)).toThrow(RangeError);
  });
});

describe("a reply that said everything but was not shaped exactly as asked", () => {
  // Two of the sixteen calls a live build made were thrown away for shape
  // rather than for content (`run-mudw1ktb-0557816b`). Each of these would have
  // been one of them, and each is something Core already knows.
  const decision = { kind: "complete", result: { candidateId: "candidate.1" } };

  it("fills in the wrapper's own name, which carries no information Core did not ask for", async () => {
    const result = await runWithReply({ summary: "Enough.", decision });

    expect(result.response).toEqual({ kind: "evidence_tool_decision", summary: "Enough.", decision });
  });

  it("lifts a reply that is the decision itself, with no wrapper around it", async () => {
    const result = await runWithReply({ kind: "tool_call", callId: "call.1", toolId: "core.run_node", input: { nodeId: "web.output.dom-click" } });

    expect(result.response).toEqual({
      kind: "evidence_tool_decision",
      // Nothing said a line, so Core writes the shortest true one rather than
      // discarding the call over it.
      summary: "tool_call core.run_node",
      decision: { kind: "tool_call", callId: "call.1", toolId: "core.run_node", input: { nodeId: "web.output.dom-click" } }
    });
  });

  it("cuts a summary one character too long instead of losing the decision under it", async () => {
    const result = await runWithReply({ kind: "evidence_tool_decision", summary: "x".repeat(400), decision });

    expect((result.response as { summary: string }).summary).toHaveLength(240);
    expect((result.response as { decision: unknown }).decision).toEqual(decision);
  });

  it("drops a field of the model's own rather than the call under it", async () => {
    const result = await runWithReply({ kind: "evidence_tool_decision", summary: "Enough.", decision, reasoning: "I have what I need." });

    // The rule this replaces refused the whole reply because a field Core
    // cannot check must not be carried onward. Dropping it carries it onward
    // even less, and keeps the call.
    expect(result.response).toEqual({ kind: "evidence_tool_decision", summary: "Enough.", decision });
  });

  it("still refuses a reply that answered a different question, and one with no decision at all", async () => {
    await expect(runWithReply({ kind: "diagnosis", summary: "The page changed.", decision })).rejects.toMatchObject({ code: "llm.provider_output_invalid" });
    await expect(runWithReply({ kind: "evidence_tool_decision", summary: "Enough." })).rejects.toMatchObject({ code: "llm.provider_output_invalid" });
    await expect(runWithReply(["not an object"])).rejects.toMatchObject({ code: "llm.provider_output_invalid" });
  });
});

/** The user message one request would put on the wire, read from the outbound body itself. */
async function userMessage(request: AutomationStudioLlmTaskRequest): Promise<string> {
  let outbound = "";
  const provider = createAutomationStudioDeepSeekProvider({
    secretReference: { kind: "secret_reference", id: "secret:deepseek" },
    resolveSecret: async (input) => { outbound = input.outboundBody; return "test-secret"; },
    fetchImpl: (async () => reply({ prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 })) as typeof fetch
  });
  await provider.runTask(request);
  const body = JSON.parse(outbound) as { messages: Array<{ role: string; content: string }> };
  return body.messages.find((message) => message.role === "user")!.content;
}

async function runWithUsage(usage: Record<string, unknown>): Promise<{ usage: Record<string, number | undefined> }> {
  const provider = createAutomationStudioDeepSeekProvider({
    secretReference: { kind: "secret_reference", id: "secret:deepseek" },
    resolveSecret: async () => "test-secret",
    fetchImpl: (async () => reply(usage)) as typeof fetch
  });
  return await provider.runTask(loopRequest(1, [])) as { usage: Record<string, number | undefined> };
}

async function runWithReply(content: unknown): Promise<{ response: unknown }> {
  const provider = createAutomationStudioDeepSeekProvider({
    secretReference: { kind: "secret_reference", id: "secret:deepseek" },
    resolveSecret: async () => "test-secret",
    fetchImpl: (async () => new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 }
    }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch
  });
  return await provider.runTask(loopRequest(1, [])) as { response: unknown };
}

function reply(usage: Record<string, unknown>): Response {
  return new Response(JSON.stringify({
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ kind: "evidence_tool_decision", summary: "Enough.", decision: { kind: "complete", result: { candidateId: "candidate.1" } } }) } }],
    usage
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function commonPrefixLength(left: string, right: string): number {
  let index = 0;
  while (index < left.length && index < right.length && left.charAt(index) === right.charAt(index)) index += 1;
  return index;
}

/** A page packet of about the size a realistic site produces. */
function evidence(count: number): Array<{ callId: string; toolId: string; value: unknown }> {
  return Array.from({ length: count }, (_, index) => ({
    callId: `call.${index + 1}`,
    toolId: "core.run_node",
    value: {
      schemaVersion: "web-llm-evidence.v2",
      url: `https://example.test/catalogue/page-${index + 1}`,
      elements: Array.from({ length: 40 }, (_, position) => ({
        target: `target.${position + 1}`,
        role: "link",
        name: `Item ${position + 1} of page ${index + 1}`,
        text: `A product row with a price and a rating, position ${position + 1}.`
      }))
    }
  }));
}

/** A node catalog of about the size a real registry produces. */
const nodeCatalog: AutomationStudioFlowBootstrapCatalogEntry[] = Array.from({ length: 25 }, (_, index) => ({
  id: index === 0 ? "web.output.dom-extract_list" : `web.output.node-${index}`,
  version: "1.0.0",
  label: `Node ${index}`,
  category: "web",
  description: "Runs one web automation step against the page, taking its target and its parameters from the call, and returning what it observed or changed.",
  capabilities: ["web.dom", "web.read"],
  inputs: [{ id: "page", type: "object" as never, required: true as const }],
  outputs: [{ id: "result", type: "object" as never }],
  parameters: Array.from({ length: 6 }, (_, position) => ({
    id: `parameter.${position}`,
    type: "string" as never,
    description: `What this parameter selects, and the shape its value has to take for the node to accept it, position ${position}.`
  }))
}));

function loopRequest(iteration: number, gathered: Array<{ callId: string; toolId: string; value: unknown }>): AutomationStudioLlmTaskRequest {
  const evidenceLoop = {
    iteration,
    tools,
    evidence: gathered as never,
    decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools, completionSchema, true, false),
    completionSchema,
    canComplete: true
  };
  return {
    requestId: "request.evidence.1",
    idempotencyKey: "request.evidence.1",
    timeoutMs: 20_000,
    estimatedInputTokens: 100,
    taskKind: "evidence_tool_decision",
    promptVersion: "automation-studio.evidence-tool-decision.v1",
    expectedOutput: "evidence_tool_decision",
    tokenLimits: { maxInputTokens: 48_000, maxOutputTokens: 4_000, maxTotalTokens: 52_000 },
    maxEstimatedCostUsd: 0.25,
    deniedEvidenceKeys: [],
    context: {
      schemaVersion: "0.1",
      taskKind: "evidence_tool_decision",
      promptVersion: "automation-studio.evidence-tool-decision.v1",
      projectId: "project.one",
      flowId: "flow.one",
      instructions: { instructions: [], instructionIds: [], diagnostics: [], tokenBudget: 8_000, estimatedTokens: 0 },
      policyGates: { mayNavigate: true, maySubmit: false },
      flowBootstrap: {
        outputSchema: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA,
        nodeCatalog,
        catalogTruncated: true,
        catalogSelection: { byteBudget: 42_132, usedBytes: Buffer.byteLength(JSON.stringify(nodeCatalog), "utf8"), requiredTerms: [], missingRequiredTerms: [] }
      },
      evidenceLoop
    }
  };
}
