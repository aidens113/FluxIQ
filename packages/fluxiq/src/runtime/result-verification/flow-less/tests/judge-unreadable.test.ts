// The Flow-less judge's check whose reply could not be read is asked again until one is read (t979). F25, live run
// `run-mwoznmcq-cd1d4618`: two of four Haiku judge replies (0047, 0053) were `llm.provider_malformed_response` at HTTP
// 200 -- a long diagnosis nested as JSON text in the decider's `result_json` transport, which a judge continuing the
// decider's conversation takes to share its cache -- and the check was not judged. No model is called: providers are
// scripted, and the last describe runs the real Anthropic adapter, the real routing and the real harness over a
// scripted fetch. The fixture is a kind of site no realistic scenario uses (a lending library's catalogue).
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AutomationStudioLlmProviderError,
  automationStudioLlmModelLadder,
  automationStudioLlmProviderRoutedByRole,
  automationStudioLlmRoleRoutedResolution,
  runAutomationStudioLlmHarness,
  runWithAutomationStudioLlmModelLadder,
  type AutomationStudioLlmProvider,
  type AutomationStudioLlmTaskRequest
} from "../../../llm/index.ts";
import { AutomationStudioLlmBuildPurse, automationStudioLlmBuildPurseScope } from "../../../llm/build-purse/index.ts";
import { createAutomationStudioAnthropicProvider } from "../../../llm/anthropic/index.ts";
import { decisionRequest } from "../../../llm/anthropic/tests/fixtures.ts";
import { automationStudioFlowLessJudge } from "../judge.ts";
import type { AutomationStudioFlowLessJudgeInput, AutomationStudioFlowLessSummary } from "../types.ts";

const DENIED = ["selector"];
const USAGE = { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.001 };
const RUNGS = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"] as const;
const NO_DIAGNOSIS = { answersRequest: "no", observed: "The catalogue shows three titles that can be borrowed; the result holds two.", defects: [{ kind: "asked_missing", row: "rows not read", requestWords: "every title" }], checked: [], answerRecords: { asked: true, siteShows: 3 } };

const summary = (): AutomationStudioFlowLessSummary => ({
  instructions: "List every title by Jane Austen on the catalogue's first page that can be borrowed, with columns title and shelf.",
  rows: { totalRows: 2, truncated: false, columns: [{ id: "title", label: "title" }, { id: "shelf", label: "shelf" }], rows: [{ title: "Persuasion", shelf: "North 4" }, { title: "Emma", shelf: "North 4" }] },
  acts: []
});

type Call = { answer: Record<string, unknown> } | { fault: "unclosed" | "malformed" | "auth" };
type Seen = { model: string; request: AutomationStudioLlmTaskRequest };

async function play(call: Call | undefined): Promise<Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>> {
  if (!call) throw new Error("no call scripted");
  if ("answer" in call) return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: call.answer }, usage: USAGE } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
  if (call.fault === "unclosed") throw new AutomationStudioLlmProviderError("llm.provider_malformed_response", "Reply was not JSON.", false, 200, undefined, undefined, undefined, { case: "content_unclosed" });
  if (call.fault === "malformed") throw new AutomationStudioLlmProviderError("llm.provider_malformed_response", "Reply was not JSON.", false, 200);
  throw new AutomationStudioLlmProviderError("llm.provider_auth_failed", "Key refused.", false, 401);
}

/** The attempt's routed provider on the ladder: one scripted provider per rung, sharing one script. */
function laddered(calls: readonly Call[]): { provider: AutomationStudioLlmProvider; seen: Seen[] } {
  const seen: Seen[] = [];
  const rung = (model: string): AutomationStudioLlmProvider => ({
    metadata: { provider: "mock", model },
    estimateCostUsd: () => 0.001,
    runTask: async (request) => {
      const call = calls[seen.length];
      seen.push({ model, request });
      return await play(call);
    }
  });
  const tiers = RUNGS.map((model) => ({ model, provider: rung(model) }));
  return { seen, provider: automationStudioLlmProviderRoutedByRole({ explore: tiers[0]!.provider, ladder: { tiers, from: { explore: 0, judge: 0, repair: 0 } } }) };
}

const judge = (provider: AutomationStudioLlmProvider, extra: Partial<AutomationStudioFlowLessJudgeInput> = {}) => automationStudioFlowLessJudge({
  summary: summary(), provider, run: runAutomationStudioLlmHarness, projectId: "project-1", flowId: "flow-1", deniedEvidenceKeys: DENIED, ...extra
});

const environment = { ...process.env };
afterEach(() => {
  process.env = { ...environment };
  vi.restoreAllMocks();
});

describe("a Flow-less judge's check whose reply could not be read", () => {
  it("is asked again with a note naming what could not be read, last, and the answer it then gives is read", async () => {
    const { provider, seen } = laddered([{ fault: "unclosed" }, { answer: NO_DIAGNOSIS }]);
    const judged = await judge(provider);
    expect(judged).toMatchObject({ verdict: "no" });
    expect(seen.map((call) => call.model)).toEqual(["claude-haiku-5-5", "claude-haiku-5-5"]);
    expect(seen[0]!.request.context.resultSummary).not.toHaveProperty("unreadableReply");
    const noted = seen[1]!.request.context.resultSummary!;
    expect(noted.unreadableReply).toContain("could not be read: the JSON object never closed: it stopped part-way through.");
    expect(Object.keys(noted).at(-1)).toBe("unreadableReply");
  });

  it("keeps its starting model through repeated unreadable replies", async () => {
    const { provider, seen } = laddered([{ fault: "malformed" }, { fault: "malformed" }, { fault: "malformed" }, { answer: NO_DIAGNOSIS }]);
    expect(await judge(provider)).toMatchObject({ verdict: "no" });
    expect(seen.map((call) => call.model)).toEqual(Array(4).fill("claude-haiku-5-5"));
  });

  it("reads a readable answer reached after re-asks exactly as a first readable answer", async () => {
    const plain = await judge(laddered([{ answer: NO_DIAGNOSIS }]).provider);
    const reasked = await judge(laddered([{ fault: "malformed" }, { fault: "malformed" }, { answer: NO_DIAGNOSIS }]).provider);
    expect(reasked).toEqual(plain);
  });

  it("still stops on the purse's refusal: not judged, with its existing why", async () => {
    const { provider, seen } = laddered([{ fault: "malformed" }, { answer: NO_DIAGNOSIS }]);
    let calls = 0;
    const run: AutomationStudioFlowLessJudgeInput["run"] = async (request) => {
      calls += 1;
      if (calls === 1) return await runAutomationStudioLlmHarness(request);
      return { ok: false, diagnostics: [{ severity: "error", code: "llm_budget.run_cost_limit", message: "The purse is spent." }] } as unknown as Awaited<ReturnType<AutomationStudioFlowLessJudgeInput["run"]>>;
    };
    expect(await judge(provider, { run })).toMatchObject({ verdict: "not_judged", refusedByPurse: true, reason: "The attempt's budget could not pay for the check, so it was not judged." });
    expect(calls).toBe(2);
    expect(seen).toHaveLength(1);
  });

  it("charges malformed replies to the caller-owned purse and refuses an unaffordable re-ask before sending", async () => {
    let sent = 0;
    const usage = { ...USAGE, estimatedCostUsd: 0.03 };
    const provider: AutomationStudioLlmProvider = {
      metadata: { provider: "mock", model: "debug-model" },
      estimateCostUsd: () => 0.03,
      runTask: async () => {
        sent += 1;
        throw new AutomationStudioLlmProviderError("llm.provider_malformed_response", "Broken JSON.", false, 200, undefined, undefined, undefined, { case: "content_unclosed", usage });
      }
    };
    const purse = new AutomationStudioLlmBuildPurse({ ceilingUsd: 0.1 });
    const verdict = await automationStudioLlmBuildPurseScope(purse, () => judge(provider));
    expect(sent).toBe(3);
    expect(purse.spentUsd()).toBeCloseTo(0.09);
    expect(purse.pendingUsd()).toBe(0);
    expect(verdict).toMatchObject({ verdict: "not_judged", refusedByPurse: true });
  });

  it("never asks again after a refused key", async () => {
    const { provider, seen } = laddered([{ fault: "malformed" }, { fault: "auth" }, { answer: NO_DIAGNOSIS }]);
    expect(await judge(provider)).toMatchObject({ verdict: "not_judged", unanswered: true });
    expect(seen).toHaveLength(2);
  });

  it("ends at the check's existing deadline, not judged for time, while its replies stay unreadable", async () => {
    vi.useFakeTimers();
    try {
      const seen: AutomationStudioLlmTaskRequest[] = [];
      const provider: AutomationStudioLlmProvider = {
        metadata: { provider: "mock", model: "debug-model" },
        runTask: async (request) => {
          seen.push(request);
          await new Promise((resolve) => setTimeout(resolve, 10));
          throw new AutomationStudioLlmProviderError("llm.provider_malformed_response", "Reply was not JSON.", false, 200);
        }
      };
      const judged = judge(provider, { deadlineMs: 1_000 });
      await vi.advanceTimersByTimeAsync(1_001);
      const judgement = await judged;
      expect(judgement).toMatchObject({ verdict: "not_judged", unanswered: true });
      expect(judgement.reason).toContain("ran out of time");
      expect(seen.length).toBeGreaterThan(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

// The coordinator's addition to t979: a judge continuing the decider's conversation takes the decider's JSON-text
// format only to share its cache; the judge's own grammar is native (`../../../models/providers/anthropic/schema.ts`,
// `jsonText: false`, `../../../llm/anthropic/tests/native-judge-schema.test.ts`). So after its first unreadable reply it
// is asked standalone, in its own format, on the same model; every later retry stays on that model. The decider here is
// sent in the JSON-text transport (`decisionTools: false`); a judge after a decider sent as tools answers in plain text
// (D12, t1038: `../../../llm/anthropic/tests/native-decision.test.ts`).
describe("a judge continuing the decider's conversation whose reply could not be read", () => {
  /** One Messages reply as JSON, the model's answer its text. */
  const reply = (text: string, model: string): Response => new Response(JSON.stringify({ id: "msg_t979", type: "message", role: "assistant", model, content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 30, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } }), { status: 200, headers: { "content-type": "application/json" } });
  const DECISION = { kind: "evidence_tool_decision", summary: "Read the shelf.", decision: { kind: "tool_call", callId: "call.4", toolId: "core.inspect_values", input: { parameters: { shelf: { name: "north" } } } } };
  const NO = { kind: "diagnosis", summary: "One title is missing.", diagnosis: NO_DIAGNOSIS };
  type Wire = { model: string; messages: { role: string; content: string | { text: string }[] }[]; output_config?: { format?: { schema?: { properties?: Record<string, unknown> } } } };
  const text = (wire: Wire) => wire.messages.map((message) => (Array.isArray(message.content) ? message.content.map((block) => block.text).join("") : message.content)).join("\n");

  it.each(["claude-haiku-5-5", "claude-sonnet-5-5"])("keeps %s after a JSON-text continuation fails and re-asks in its native standalone format (t979; t1065 keeps a decider sent as tools in its conversation)", async (startingModel) => {
    const directory = mkdtempSync(join(tmpdir(), "t979-step-log-"));
    process.env.FLUXIQ_LLM_STEP_LOG_DIR = directory;
    try {
      const sent: Wire[] = [];
      const replies = [
        JSON.stringify({ result_json: JSON.stringify(DECISION) }),
        // The F25 shape: the JSON text inside result_json breaks part-way through.
        `{"result_json": "{\\"kind\\":\\"diagnosis\\",\\"diagnosis\\":{\\"answersRequest\\":\\"no\\",\\"observed\\":\\"The catalogue shows`,
        // Standalone and native, and still broken.
        `{"kind":"diagnosis","diagnosis":{"answersRequest":"no","observed":"The catalogue`,
        JSON.stringify(NO)
      ];
      const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
        const wire = JSON.parse(String(init.body)) as Wire;
        sent.push(wire);
        return reply(replies[sent.length - 1] ?? JSON.stringify(NO), wire.model);
      });
      const resolver = async (input: { modelId?: string }) => ({
        provider: createAutomationStudioAnthropicProvider({ model: input.modelId ?? RUNGS[0], secretReference: { kind: "secret_reference", id: "secret:claude" }, resolveSecret: async () => "dummy-provider-key", decisionTools: false, fetchImpl: fetchImpl as unknown as typeof fetch })
      });
      const resolution = await automationStudioLlmRoleRoutedResolution(resolver, { projectId: "project-1", flowId: "flow-1", modelId: startingModel });
      const provider = resolution!.provider;
      const decider = decisionRequest();
      decider.deniedEvidenceKeys = [];
      decider.context.evidenceLoop!.evidence = ["call.1", "call.2", "call.3"].map((callId, at) => ({ callId, toolId: "core.run_node", value: { ok: true, page: `Shelf ${at + 1}: Emma, Persuasion, Sanditon.` } }));

      const judgement = await runWithAutomationStudioLlmModelLadder(automationStudioLlmModelLadder(), async () => {
        await provider.runTask(decider);
        return await judge(provider, { continuesDecider: true, tokenLimits: { maxInputTokens: 900_000, maxOutputTokens: 8_000, maxTotalTokens: 1_000_000 } });
      });

      expect(judgement).toMatchObject({ verdict: "no" });
      expect(sent.map((wire) => wire.model)).toEqual(Array(4).fill(startingModel));
      const [, continuing, standalone, retried] = sent as [Wire, Wire, Wire, Wire];
      // The first judge continues the decider: its JSON-text transport and the system turn after the decider's blocks.
      expect(continuing.output_config?.format?.schema?.properties).toHaveProperty("result_json");
      expect(continuing.messages).toHaveLength(2);
      expect(text(continuing)).not.toContain("unreadableReply");
      // Asked again on its own request, in the judge's own native grammar, with the note, on the same model.
      expect(standalone.output_config?.format?.schema?.properties).not.toHaveProperty("result_json");
      expect(standalone.output_config?.format?.schema?.properties).toHaveProperty("diagnosis");
      expect(standalone.messages).toHaveLength(1);
      expect(text(standalone)).toContain("unreadableReply");
      // Unreadable again: the same model, still native and standalone.
      expect(retried.output_config?.format?.schema?.properties).not.toHaveProperty("result_json");
      expect(retried.messages).toHaveLength(1);
      expect(text(retried)).toContain("unreadableReply");
      const notes = readdirSync(directory).filter((folder) => folder.endsWith("-note")).map((folder) => (JSON.parse(readFileSync(join(directory, folder, "meta.json"), "utf8")) as { line: string }).line);
      expect(notes.some((note) => note.includes("on its own request where the decider answered in JSON text"))).toBe(true);
      // Both replies stopped part-way through the same way: the second is the same unreadable reply again, a loop for the
      // judge, caught and steered on the same model (t1000; before t1000 it was only asked again with a note).
      expect(notes.some((note) => note.includes("the same way as the reply before it, so it is caught as repeating itself and asked again on the same model"))).toBe(true);
      expect(text(retried)).toContain("You have sent the same unreadable reply 2 times in a row");
      // Each judge's step meta says which way it went: the standalone asks say why they did not continue (t979).
      const judged = readdirSync(directory).filter((folder) => folder.endsWith("-judge")).sort().map((folder) => (JSON.parse(readFileSync(join(directory, folder, "meta.json"), "utf8")) as { continuation?: unknown }).continuation);
      expect(judged).toEqual([{ used: true, reason: "continues_the_decider" }, { used: false, reason: "standalone_after_unreadable" }, { used: false, reason: "standalone_after_unreadable" }]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

// t1000: the same unreadable reply again is a loop for the judge role. t994 (W1) saw a scripted judge whose yes lacked one
// required field asked again 2,399 times in 90 s: each re-ask said only that the reply did not fit, so nothing could
// change, and nothing noticed the repeat. Now each re-ask names where the reply parted from the schema, and the same
// unreadable reply again is caught and steered as every role's loop is, on the same model, with no cap and no wait.
describe("a judge that sends the same unreadable reply again", () => {
  const MISSES = [{ path: "response.diagnosis.defects", rule: "is missing, and it must be there" }];
  /** A reply that was sound JSON off the schema, by path and rule alone, as the Anthropic adapter reports it. */
  const offShape = (): never => {
    throw new AutomationStudioLlmProviderError("llm.provider_output_invalid", "Reply did not fit the schema.", false, 200, undefined, undefined, undefined, { case: "content_off_shape", misses: MISSES });
  };
  /** A provider answering off the schema `unreadable` times, then `answer`. */
  const scripted = (unreadable: number, answer: Record<string, unknown> = NO_DIAGNOSIS) => {
    const seen: AutomationStudioLlmTaskRequest[] = [];
    const provider: AutomationStudioLlmProvider = {
      metadata: { provider: "mock", model: "claude-haiku-5-5" },
      estimateCostUsd: () => 0.001,
      runTask: async (request) => {
        seen.push(request);
        if (seen.length <= unreadable) return offShape();
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: answer }, usage: USAGE } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
      }
    };
    return { provider, seen };
  };
  const note = (request: AutomationStudioLlmTaskRequest | undefined): string => String(request?.context.resultSummary?.unreadableReply ?? "");

  it("names where the reply parted from the schema, so the next reply can change, and a re-ask that parses settles as a first answer would", async () => {
    const { provider, seen } = scripted(1);
    const plain = await judge(scripted(0).provider);
    expect(await judge(provider)).toEqual(plain);
    expect(seen).toHaveLength(2);
    expect(note(seen[1])).toContain("it was JSON, but it did not fit the answer asked for: response.diagnosis.defects is missing, and it must be there.");
    // One unreadable reply is no loop: nothing is steered.
    expect(note(seen[1])).not.toContain("same unreadable reply");
  });

  it("is caught as repeating itself and steered: told what it repeated, how often, and the judge's decision, on the same model", async () => {
    const directory = mkdtempSync(join(tmpdir(), "t1000-judge-loop-"));
    process.env.FLUXIQ_LLM_STEP_LOG_DIR = directory;
    try {
      const { provider, seen } = scripted(3);
      expect(await judge(provider)).toMatchObject({ verdict: "no" });
      expect(seen).toHaveLength(4);
      expect(seen.every((request) => request.context.resultSummary !== undefined)).toBe(true);
      // After the first: what could not be read, and no steer yet.
      expect(note(seen[1])).not.toContain("same unreadable reply");
      // After the second, the same way: a loop, steered with the count and the decisions the judge may make.
      expect(note(seen[2])).toContain("response.diagnosis.defects is missing, and it must be there");
      expect(note(seen[2])).toContain("You have sent the same unreadable reply 2 times in a row");
      expect(note(seen[2])).toContain("change_approach");
      expect(note(seen[2])).toContain("finish_with_best");
      expect(note(seen[2])).not.toContain("ask_person");
      expect(note(seen[3])).toContain("the same unreadable reply 3 times in a row");
      // Recorded as every role's loop is: a `loop` step folder per steer, and the step log's note says so.
      const loops = readdirSync(directory).filter((folder) => folder.endsWith("-loop")).map((folder) => JSON.parse(readFileSync(join(directory, folder, "meta.json"), "utf8")) as { rung: string; pattern: string; repeats: number; toolIds: string[] });
      expect(loops).toEqual([expect.objectContaining({ rung: "steer", pattern: "exact_repeat", repeats: 2, toolIds: ["loop_verification"] }), expect.objectContaining({ rung: "steer", pattern: "exact_repeat", repeats: 3 })]);
      const notes = readdirSync(directory).filter((folder) => folder.endsWith("-note")).map((folder) => (JSON.parse(readFileSync(join(directory, folder, "meta.json"), "utf8")) as { line: string }).line);
      expect(notes.filter((line) => line.includes("caught as repeating itself"))).toHaveLength(2);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("a different unreadable reply in between is not the same reply again", async () => {
    let calls = 0;
    const seen: AutomationStudioLlmTaskRequest[] = [];
    const provider: AutomationStudioLlmProvider = {
      metadata: { provider: "mock", model: "claude-haiku-5-5" },
      runTask: async (request) => {
        seen.push(request);
        calls += 1;
        if (calls === 1) return offShape();
        if (calls === 2) throw new AutomationStudioLlmProviderError("llm.provider_malformed_response", "Reply was not JSON.", false, 200, undefined, undefined, undefined, { case: "content_unclosed" });
        return { response: { kind: "diagnosis", summary: "Judged.", diagnosis: NO_DIAGNOSIS }, usage: USAGE } as Awaited<ReturnType<AutomationStudioLlmProvider["runTask"]>>;
      }
    };
    expect(await judge(provider)).toMatchObject({ verdict: "no" });
    expect(note(seen[2])).toContain("the JSON object never closed");
    expect(note(seen[2])).not.toContain("same unreadable reply");
  });
});
