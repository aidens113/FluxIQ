// A decision checked as Core reads it, against the variant it names (t1025). Each shape is a reply of the bigbox runs of
// 2026-11-24 that was refused `content_off_shape`, key for key, with made-up tools and words: what the model wrote, and
// nothing it saw on a page. Each was a whole paid call of about 120k input tokens.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { automationStudioLlmProviderReplyAccount } from "../../../models/failures/index.ts";
import { automationStudioLlmEvidenceDecisionRefusal, type AutomationStudioLlmEvidenceTool } from "../../evidence-loop/index.ts";
import { automationStudioLlmEvidenceParseDecision, buildAutomationStudioLlmEvidenceLoopDecisionSchema } from "../../evidence-loop-decision.ts";
import { parseAutomationStudioLlmProviderResult, type AutomationStudioLlmTaskRequest } from "../../harness/index.ts";
import { automationStudioLlmLoopDecisionTool } from "../../loop-decision/index.ts";
import { automationStudioLlmUnusableDecisionFeedback } from "../../unusable-decision.ts";
import { createAutomationStudioAnthropicProvider } from "../provider.ts";
import { automationStudioAnthropicTaskAnswer } from "../task-answer.ts";
import { decisionRequest, streamReply } from "./fixtures.ts";

const USAGE = { inputTokens: 100, outputTokens: 30, totalTokens: 130 };
const NODES = ["lib.output.read_list", "lib.output.snapshot", "lib.output.next_page", "lib.output.press"];
const tool = (toolId: string, inputSchema: JsonObject, effect: "observe" | "mutate" = "observe"): AutomationStudioLlmEvidenceTool => ({ toolId, description: toolId, inputSchema, effect });
const find = tool("core.find_text", { type: "object", additionalProperties: false, required: ["query"], properties: { query: { type: "string" } } });
const runNode = (nodes = NODES) => tool("core.run_node", { type: "object", additionalProperties: false, required: ["node", "parameters", "consequences"], properties: { node: { enum: nodes }, parameters: { type: "object" }, consequences: { type: "array", items: { enum: ["send_or_publish"] } } } }, "mutate");
const runFlow = tool("core.run_flow", { type: "object", additionalProperties: false, required: ["from"], properties: { from: { type: "integer" }, to: { type: "integer" } } }, "mutate");
const ALL = [find, runNode(), automationStudioLlmLoopDecisionTool(), runFlow];
/** What was offered once looks were withdrawn: no look, and the node runner without the node that only looked. */
const WITHDRAWN = [runNode(NODES.filter((node) => node !== "lib.output.snapshot")), runFlow];

/** A decision request offering `tools`, with drafting's call keys, as the build offered them. */
function offering(tools: AutomationStudioLlmEvidenceTool[]): AutomationStudioLlmTaskRequest {
  const base = decisionRequest();
  const loop = base.context.evidenceLoop!;
  return { ...base, context: { ...base.context, evidenceLoop: { ...loop, tools, canComplete: true, decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools, loop.completionSchema, true, true, true) } } };
}
const reply = (decision: unknown) => ({ kind: "evidence_tool_decision", summary: "Going on.", decision });
const nodeCall = { node: "lib.output.next_page", parameters: { nextPage: { list: "handle.5" } }, consequences: [] };
const thrownBy = (run: () => unknown) => {
  try {
    run();
    return undefined;
  } catch (error) {
    return error as { code: string; reply?: { case?: string; misses?: Array<{ path: string; rule: string }> } };
  }
};
/** The reply through the adapter, then the harness, as every provider's reply goes. */
function read(decision: unknown, tools = ALL) {
  const answer = automationStudioAnthropicTaskAnswer(reply(decision), offering(tools), USAGE, 300);
  return parseAutomationStudioLlmProviderResult({ response: answer }, "evidence_tool_decision", undefined, tools);
}
const errors = (result: ReturnType<typeof read>) => result.diagnostics.filter((one) => one.severity === "error");

describe("replies that mean one offered decision are read as it", () => {
  it("run-mwuuo3zk step 144: kind loop_decision on an otherwise exact call of core.loop_decision", () => {
    const result = read({ kind: "loop_decision", callId: "loop.stop.1", toolId: "core.loop_decision", input: { decision: "ask_person", question: "Which one?", why: "Two fit." } });
    expect(errors(result)).toEqual([]);
    expect(result.diagnostics.map((one) => one.code)).toContain("llm_output.decision_kind_inferred");
    expect(automationStudioLlmEvidenceParseDecision((result.response as { decision: unknown }).decision)).toMatchObject({ kind: "tool_call", toolId: "core.loop_decision", input: { decision: "ask_person" } });
  });

  it("run-mwuxd2v9 step 215: the same call written flat under the tool's name", () => {
    const result = read({ kind: "loop_decision", decision: "ask_person", question: "Which one?", why: "Two fit." });
    expect(errors(result)).toEqual([]);
    expect(result.diagnostics.map((one) => one.code)).toContain("llm_output.flat_tool_call_read");
    expect(automationStudioLlmEvidenceParseDecision((result.response as { decision: unknown }).decision)).toMatchObject({ kind: "tool_call", toolId: "core.loop_decision", input: { decision: "ask_person", question: "Which one?", why: "Two fit." } });
  });

  it("run-mwus396e step 45: a node call with act and place written null", () => {
    const result = read({ kind: "tool_call", callId: "page.next.4", toolId: "core.run_node", input: nodeCall, add: true, act: null, place: null });
    expect(errors(result)).toEqual([]);
    expect(result.diagnostics.map((one) => one.code)).toContain("llm_output.null_key_read_as_absent");
    expect(automationStudioLlmEvidenceParseDecision((result.response as { decision: unknown }).decision)).toMatchObject({ kind: "tool_call", toolId: "core.run_node", add: true });
  });

  it("run-mwuuo3zk step 89, run-mwuxd2v9 step 196: a node's id as the toolId, its input the node runner's own", () => {
    const result = read({ kind: "tool_call", callId: "next.41", toolId: "lib.output.next_page", input: nodeCall, add: false }, WITHDRAWN);
    expect(errors(result)).toEqual([]);
    expect(result.diagnostics.map((one) => one.code)).toContain("llm_output.tool_id_read_from_input");
    expect(automationStudioLlmEvidenceParseDecision((result.response as { decision: unknown }).decision)).toMatchObject({ kind: "tool_call", toolId: "core.run_node", input: nodeCall });
  });
});

describe("a decision naming a tool the schema does not offer is the loop's to refuse, by name", () => {
  it("run-mwuuo3zk step 124: a look withdrawn a decision earlier is not answered from the variant it came nearest", () => {
    const decision = { kind: "tool_call", callId: "verify.10", toolId: "core.find_text", input: { query: "four stars" } };
    // Before t1025 this was refused here: "toolId must be exactly core.run_flow; input.from is missing".
    expect(thrownBy(() => automationStudioAnthropicTaskAnswer(reply(decision), offering(WITHDRAWN), USAGE, 300))).toBeUndefined();
    expect(errors(read(decision, WITHDRAWN))).toEqual([]);
  });

  it("run-mwuuo3zk steps 219 and 247: a node's id as the toolId with the node's own input is told what goes where", () => {
    for (const [decision, offered] of [
      [{ kind: "tool_call", callId: "snap.42", toolId: "lib.output.snapshot", input: {} }, ALL],
      [{ kind: "tool_call", callId: "read.29", toolId: "lib.output.read_list", input: { readList: { handle: "handle.18" } }, add: false }, ALL]
    ] as const) {
      // Before t1025: "toolId must be exactly <whichever tool's input the reply's came nearest>".
      expect(thrownBy(() => automationStudioAnthropicTaskAnswer(reply(decision), offering([...offered]), USAGE, 300))).toBeUndefined();
      const parsed = automationStudioLlmEvidenceParseDecision((read(decision, [...offered]).response as { decision: unknown }).decision);
      const refusal = automationStudioLlmEvidenceDecisionRefusal(decision, parsed, { complete: true, amend: true, unknownTool: { known: new Set(offered.map((one) => one.toolId)), shown: offered } });
      expect(refusal).toMatchObject({ issueCodes: ["llm_evidence_loop.unknown_tool_refused"], unknownTool: { toolId: decision.toolId, nearest: "core.run_node", takenBy: { toolId: "core.run_node", key: "node" } } });
      const feedback = automationStudioLlmUnusableDecisionFeedback({ issueCodes: refusal!.issueCodes, stepsWithoutProgress: 1, maxStepsWithoutProgress: Number.POSITIVE_INFINITY, unknownTool: refusal!.unknownTool! });
      expect(feedback.instruction).toContain(`"${decision.toolId}" is not a tool but a value that "core.run_node" takes in input.node: call "core.run_node" with input.node "${decision.toolId}"`);
    }
  });
});

describe("what is not one offered decision is still refused, with misses of its own", () => {
  it("run-mwuuo3zk step 308: a withdrawn node in the node runner's call is refused at the node, not the tool", () => {
    const failure = thrownBy(() => automationStudioAnthropicTaskAnswer(reply({ kind: "tool_call", callId: "snap.11", toolId: "core.run_node", input: { node: "lib.output.snapshot", parameters: {}, consequences: [] } }), offering(WITHDRAWN), USAGE, 300));
    expect(failure?.code).toBe("llm.provider_output_invalid");
    expect(failure?.reply?.misses).toEqual([{ path: "response.decision.input.node", rule: 'must be one of "lib.output.read_list", "lib.output.next_page", "lib.output.press"' }]);
  });

  it("an offered tool's input is held to that tool's variant alone", () => {
    const failure = thrownBy(() => automationStudioAnthropicTaskAnswer(reply({ kind: "tool_call", callId: "find.1", toolId: "core.find_text", input: { query: "cups", target: "t45" } }), offering(ALL), USAGE, 300));
    expect(failure?.reply?.misses).toEqual([{ path: "response.decision.input.target", rule: "is not a key this object takes" }]);
  });

  it("run-mwuxd2v9 step 78: a summary and no decision is told the decision is missing, not the word Core writes itself", async () => {
    const failure = thrownBy(() => automationStudioAnthropicTaskAnswer({ summary: "Choose the store, add the item, then read the cart." }, offering(ALL), USAGE, 80));
    expect(failure?.reply?.misses).toEqual([{ path: "response.decision", rule: "is missing, and it must be there" }]);
    const feedback = automationStudioLlmUnusableDecisionFeedback({ issueCodes: ["llm.provider_output_invalid"], stepsWithoutProgress: 0, maxStepsWithoutProgress: 8, unreadable: { reply: automationStudioLlmProviderReplyAccount(failure?.reply), inARow: 1, maxInARow: Number.POSITIVE_INFINITY } });
    expect(feedback.instruction).toContain("At fault: response.decision is missing, and it must be there.");
  });
});

// The JSON-text transport (`decisionTools: false`): a decision sent as tools has no envelope to nest (D12, t1038).
describe("run-mwuxd2v9 step 74: the envelope inside the envelope", () => {
  it("is opened once more, and the decision in it is read", async () => {
    const decision = { kind: "amend_draft", amendments: [{ step: 3, change: "drop" }] };
    const twice = JSON.stringify({ result_json: JSON.stringify({ result_json: JSON.stringify(reply(decision)) }) });
    const provider = createAutomationStudioAnthropicProvider({ secretReference: { kind: "secret_reference", id: "secret:claude" }, resolveSecret: async () => "dummy-provider-key", decisionTools: false, fetchImpl: vi.fn(async () => streamReply(twice, "end_turn")) });
    const result = await provider.runTask(offering(ALL)) as { response: { decision: unknown } };
    expect(result.response.decision).toEqual(decision);
  });
});
