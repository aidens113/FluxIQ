// D12 (t1038): an evidence decision goes to DeepSeek as one native function call, is read back from
// `choices[0].message.tool_calls` into the wrapper the loop reads, and takes the path a JSON decision takes. No model
// is called: the fetch is scripted.
import { describe, expect, it, vi } from "vitest";
import { buildAutomationStudioLlmEvidenceLoopDecisionSchema } from "../../evidence-loop-decision.ts";
import type { AutomationStudioLlmTaskRequest } from "../../harness/index.ts";
import { automationStudioLlmRequestDecisionTools } from "../../provider-task/index.ts";
import { createAutomationStudioDeepSeekProvider } from "../provider.ts";
import { automationStudioDeepSeekDecisionTools } from "../decision-tools.ts";
import { buildAutomationStudioDeepSeekRequestBody, measureAutomationStudioDeepSeekInput } from "../request-body.ts";

const TOOLS = [
  { toolId: "core.run_node", description: "Run one node.", effect: "mutate" as const, inputSchema: { type: "object", additionalProperties: false, required: ["node"], properties: { node: { type: "string" }, parameters: { type: "object" } } } },
  { toolId: "web.read_list", description: "Read a list.", effect: "observe" as const, inputSchema: { type: "object", additionalProperties: false, properties: { target: { type: "string" } } } }
];
const COMPLETION = { type: "object", additionalProperties: false, required: ["summary"], properties: { summary: { type: "string" } } };

function decider(): AutomationStudioLlmTaskRequest {
  return {
    requestId: "request.one", idempotencyKey: "idempotency.one", timeoutMs: 20_000, estimatedInputTokens: 100,
    taskKind: "evidence_tool_decision", promptVersion: "automation-studio.evidence-tool-decision.v1", expectedOutput: "evidence_tool_decision",
    tokenLimits: { maxInputTokens: 992_000, maxOutputTokens: 8_000, maxTotalTokens: 1_000_000 }, maxEstimatedCostUsd: 0.25,
    context: {
      schemaVersion: "0.1", taskKind: "evidence_tool_decision", promptVersion: "automation-studio.evidence-tool-decision.v1", projectId: "project.one", flowId: "flow.one",
      instructions: { instructions: [], instructionIds: [], diagnostics: [], tokenBudget: 8000, estimatedTokens: 0 },
      evidenceLoop: { iteration: 1, tools: TOOLS, evidence: [], canComplete: true, completionSchema: COMPLETION, decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema(TOOLS, COMPLETION, true, true, true) }
    }
  } as unknown as AutomationStudioLlmTaskRequest;
}

const USAGE = { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 };
type Wire = { model: string; tools?: Array<{ type: string; function: { name: string; description: string; parameters: Record<string, unknown> } }>; tool_choice?: unknown; response_format?: unknown; messages: { role: string; content: string }[] };
type Failure = { code: string; reply?: { case: string; finishReason?: string }; paid?: { outputTokens?: number } };

const call = (name: string, input: unknown, id = "call_0") => ({ id, type: "function", function: { name, arguments: typeof input === "string" ? input : JSON.stringify(input) } });
const reply = (toolCalls: unknown[] | undefined, extra: { finish?: string; content?: string | null } = {}) => new Response(JSON.stringify({
  id: "chat_1", choices: [{ index: 0, finish_reason: extra.finish ?? "tool_calls", message: { role: "assistant", content: extra.content ?? null, ...(toolCalls ? { tool_calls: toolCalls } : {}) } }], usage: USAGE
}), { status: 200, headers: { "content-type": "application/json" } });

function adapter(replies: Array<() => Response>, options: { decisionTools?: boolean } = {}) {
  const sent: Wire[] = [];
  const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)) as Wire);
    return replies[Math.min(sent.length - 1, replies.length - 1)]!();
  });
  const provider = createAutomationStudioDeepSeekProvider({ secretReference: { kind: "secret_reference", id: "secret:deepseek" }, resolveSecret: async () => "dummy-provider-key", fetchImpl: fetchImpl as unknown as typeof fetch, ...options });
  return { provider, sent };
}

const failureOf = async (promise: Promise<unknown>) => await promise.then(() => undefined, (error: unknown) => error as Failure);
const contextOf = (wire: { messages: { content: string }[] }) => wire.messages[1]!.content.split("\"context\":")[1];

describe("an evidence decision sent to DeepSeek as tools", () => {
  it("offers one function per decision variant, the call required, and no response format or outputSchema", async () => {
    const { provider, sent } = adapter([() => reply([call("core_run_node", { summary: "Run it.", callId: "call.1", input: { node: "a.press" } })])]);
    await provider.runTask(decider());
    const wire = sent[0]!;
    expect(wire.tools!.map((tool) => tool.function.name)).toEqual(["complete", "amend_draft", "core_run_node", "web_read_list"]);
    expect(wire.tools!.every((tool) => tool.type === "function")).toBe(true);
    expect(wire.tool_choice).toBe("required");
    expect(wire.response_format).toBeUndefined();
    expect(wire.messages[0]!.content.startsWith("Answer by calling exactly one of the offered tools")).toBe(true);
    expect(JSON.parse(wire.messages[1]!.content)).not.toHaveProperty("outputSchema");
    // The tools lead the request, before the messages, so what does not change is the front of the prompt.
    const body = JSON.stringify(wire);
    expect(body.indexOf("\"tools\"")).toBeLessThan(body.indexOf("\"messages\""));
  });

  it("keeps the user message's context byte for byte what the JSON-object request sends, and the tools deterministic", () => {
    const task = decider();
    const tools = automationStudioDeepSeekDecisionTools(task)!;
    const asTools = buildAutomationStudioDeepSeekRequestBody(task, "deepseek-flash", tools);
    const asJson = buildAutomationStudioDeepSeekRequestBody(task, "deepseek-flash");
    expect(contextOf(JSON.parse(asTools) as Wire)).toBe(contextOf(JSON.parse(asJson) as Wire));
    expect(JSON.parse(asJson)).toMatchObject({ response_format: { type: "json_object" } });
    expect(JSON.parse(asJson)).not.toHaveProperty("tools");
    expect(buildAutomationStudioDeepSeekRequestBody(decider(), "deepseek-flash", automationStudioLlmRequestDecisionTools(decider())!)).toBe(asTools);
    // The tools are input, so the measure counts them.
    expect(measureAutomationStudioDeepSeekInput(task, tools).estimatedInputBytes).toBeGreaterThan(0);
  });

  it("reads a call for each variant kind as exactly the wrapper the loop reads", async () => {
    const wrappers = [
      { kind: "evidence_tool_decision", summary: "Run it.", decision: { kind: "tool_call", callId: "call.1", toolId: "core.run_node", input: { node: "a.press" } } },
      { kind: "evidence_tool_decision", summary: "Read it.", decision: { kind: "tool_call", callId: "call.2", toolId: "web.read_list", input: { target: "t1" } } },
      { kind: "evidence_tool_decision", summary: "Done.", decision: { kind: "complete", result: { summary: "All read." } } }
    ];
    const offer = automationStudioLlmRequestDecisionTools(decider())!;
    for (const wrapper of wrappers) {
      const { kind, toolId, ...rest } = wrapper.decision as Record<string, unknown>;
      const tool = offer.tools.find((candidate) => candidate.variant.kind === kind && candidate.variant.toolId === toolId)!;
      const { provider } = adapter([() => reply([call(tool.name, { summary: wrapper.summary, ...rest })])]);
      const result = await provider.runTask(decider()) as { response: unknown; usage: { outputTokens: number } };
      expect(result.response).toEqual(wrapper);
      expect(result.usage.outputTokens).toBe(20);
    }
  });

  it("refuses a call the request did not offer, as a paid failure that says so", async () => {
    const failure = await failureOf(adapter([() => reply([call("core_run_flow", { summary: "Go." })])]).provider.runTask(decider()));
    expect(failure).toMatchObject({ code: "llm.provider_output_invalid", reply: { case: "tool_call_unknown", finishReason: "tool_calls" }, paid: { outputTokens: 20 } });
  });

  it("refuses a reply with no call, or with two, as paid failures that say which", async () => {
    const none = await failureOf(adapter([() => reply(undefined, { finish: "stop", content: "{\"kind\":\"evidence_tool_decision\"}" })]).provider.runTask(decider()));
    expect(none).toMatchObject({ code: "llm.provider_output_invalid", reply: { case: "tool_call_missing", finishReason: "stop" }, paid: { outputTokens: 20 } });
    const two = await failureOf(adapter([() => reply([call("complete", { summary: "a", result: {} }), call("complete", { summary: "b", result: {} }, "call_1")])]).provider.runTask(decider()));
    expect(two).toMatchObject({ code: "llm.provider_output_invalid", reply: { case: "tool_call_several" } });
  });

  it("refuses arguments that are not JSON, or not an object, and a cut reply, paid", async () => {
    const broken = await failureOf(adapter([() => reply([call("core_run_node", "{\"summary\": \"x\", ")])]).provider.runTask(decider()));
    expect(broken).toMatchObject({ code: "llm.provider_output_invalid", reply: { case: "content_invalid" }, paid: { outputTokens: 20 } });
    const array = await failureOf(adapter([() => reply([call("core_run_node", "[1]")])]).provider.runTask(decider()));
    expect(array).toMatchObject({ code: "llm.provider_output_invalid", reply: { case: "content_not_object" } });
    const cut = await failureOf(adapter([() => reply([call("core_run_node", "{\"summary\": \"x\"")], { finish: "length" })]).provider.runTask(decider()));
    expect(cut).toMatchObject({ code: "llm.provider_output_truncated" });
  });

  it("passes an input off the schema on as the decision it is, as a JSON reply is: this adapter holds no reply to the whole schema, the loop does", async () => {
    const { provider } = adapter([() => reply([call("core_run_node", { summary: "Run it." })])]);
    const result = await provider.runTask(decider()) as { response: unknown };
    expect(result.response).toEqual({ kind: "evidence_tool_decision", summary: "Run it.", decision: { kind: "tool_call", toolId: "core.run_node" } });
  });

  it("keeps the JSON-object transport where the provider is told to, and for every task that is no evidence decision", async () => {
    const decision = { kind: "evidence_tool_decision", summary: "Done.", decision: { kind: "complete", result: { summary: "ok" } } };
    const text = adapter([() => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(decision) } }], usage: USAGE }), { status: 200, headers: { "content-type": "application/json" } })], { decisionTools: false });
    expect((await text.provider.runTask(decider()) as { response: unknown }).response).toEqual(decision);
    expect(text.sent[0]!.tools).toBeUndefined();
    expect(text.sent[0]!.response_format).toEqual({ type: "json_object" });
    const judge = { ...decider(), taskKind: "loop_verification" as const, expectedOutput: "diagnosis" as const };
    expect(automationStudioDeepSeekDecisionTools(judge)).toBeUndefined();
    expect(buildAutomationStudioDeepSeekRequestBody(judge, "deepseek-flash", automationStudioDeepSeekDecisionTools(judge))).toContain("\"response_format\":{\"type\":\"json_object\"}");
  });
});
