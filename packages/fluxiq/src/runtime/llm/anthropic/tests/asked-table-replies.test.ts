// The two shapes of unreadable decision the bigbox run run-mwveg5ls-0266dfe0 still had after t1025 (t1034), each
// key for key with made-up tools and words: what the model wrote, and nothing it saw on a page.
//
// - Step 73: a press whose `add` and `act` were written inside `input`. It is the call it can only be.
// - Steps 192 and 215: a call of the node runner naming the look that looks had withdrawn. It is a decision, and the
//   loop refuses it by name (`llm_evidence_loop.look_withdrawn`); the adapter no longer refuses it unread.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { automationStudioLlmEvidenceLookWithdrawal, automationStudioLlmEvidenceWithdrawnActions } from "../../decision-handlers/index.ts";
import type { AutomationStudioLlmEvidenceTool } from "../../evidence-loop/index.ts";
import { automationStudioLlmEvidenceParseDecision, buildAutomationStudioLlmEvidenceLoopDecisionSchema } from "../../evidence-loop-decision.ts";
import { parseAutomationStudioLlmProviderResult, type AutomationStudioLlmTaskRequest } from "../../harness/index.ts";
import { automationStudioAnthropicTaskAnswer } from "../task-answer.ts";
import { decisionRequest } from "./fixtures.ts";

const USAGE = { inputTokens: 100, outputTokens: 30, totalTokens: 130 };
const NODES = ["lib.output.press", "lib.output.read_list", "lib.output.snapshot"];
const runNode: AutomationStudioLlmEvidenceTool = {
  toolId: "core.run_node",
  description: "Run one node.",
  effect: "mutate",
  actionInputKey: "node",
  inputSchema: { type: "object", additionalProperties: false, required: ["node", "parameters", "consequences"], properties: { node: { enum: NODES, description: "The node's id." }, parameters: { type: "object" }, consequences: { type: "array", items: { enum: ["send_or_publish"] } } } }
};
const find: AutomationStudioLlmEvidenceTool = { toolId: "core.find_text", description: "Find text.", effect: "observe", inputSchema: { type: "object", additionalProperties: false, required: ["query"], properties: { query: { type: "string" } } } };

function offering(tools: AutomationStudioLlmEvidenceTool[]): AutomationStudioLlmTaskRequest {
  const base = decisionRequest();
  const loop = base.context.evidenceLoop!;
  return { ...base, context: { ...base.context, evidenceLoop: { ...loop, tools, canComplete: true, decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools, loop.completionSchema, true, true, true) } } };
}
const reply = (decision: unknown) => ({ kind: "evidence_tool_decision", summary: "Going on.", decision });
const thrownBy = (run: () => unknown) => {
  try {
    run();
    return undefined;
  } catch (error) {
    return error as { code: string; reply?: { misses?: unknown } };
  }
};

describe("run-mwveg5ls step 73: a press with add and act written inside its input", () => {
  const press = { node: "lib.output.press", parameters: { target: { handle: "t25" } }, consequences: [] };
  const decision = { kind: "tool_call", callId: "cart.add.1", toolId: "core.run_node", input: { ...press, add: true, act: "a1" } };

  it("is read as the call it can only be, add and act beside the input", () => {
    const tools = [find, runNode];
    expect(thrownBy(() => automationStudioAnthropicTaskAnswer(reply(decision), offering(tools), USAGE, 300))).toBeUndefined();
    const answer = automationStudioAnthropicTaskAnswer(reply(decision), offering(tools), USAGE, 300);
    const result = parseAutomationStudioLlmProviderResult({ response: answer }, "evidence_tool_decision", undefined, tools);
    expect(result.diagnostics.filter((one) => one.severity === "error")).toEqual([]);
    expect(result.diagnostics.map((one) => one.code)).toContain("llm_output.own_key_lifted_from_input");
    expect(automationStudioLlmEvidenceParseDecision((result.response as { decision: unknown }).decision)).toMatchObject({ kind: "tool_call", toolId: "core.run_node", input: press, add: true, act: "a1" });
  });

  it("is not read so where the tool's own input takes the key, or the call already carries it", () => {
    const takesAdd: AutomationStudioLlmEvidenceTool = { ...runNode, inputSchema: { ...runNode.inputSchema, properties: { ...(runNode.inputSchema.properties as JsonObject), add: { type: "boolean" } } } };
    const own = parseAutomationStudioLlmProviderResult({ response: reply(decision) }, "evidence_tool_decision", undefined, [takesAdd]);
    expect((own.response as { decision: unknown }).decision).toMatchObject({ input: { add: true }, act: "a1" });
    const both = parseAutomationStudioLlmProviderResult({ response: reply({ ...decision, add: false }) }, "evidence_tool_decision", undefined, [runNode]);
    expect((both.response as { decision: { add: unknown; input: JsonObject } }).decision).toMatchObject({ add: false, act: "a1", input: { add: true } });
  });
});

describe("run-mwveg5ls steps 192 and 215: the node runner asked for the look looks had withdrawn", () => {
  /** Looks withdrawn exactly as the loop withdraws them: the snapshot seen to look, a redirect ignored. */
  function withdrawn() {
    const looks = automationStudioLlmEvidenceLookWithdrawal({ enabled: true });
    looks.sawLook("core.run_node", "lib.output.snapshot");
    looks.redirectShown(4);
    expect(looks.askedAgain(5, 0)).toBe(true);
    return { looks, offered: looks.offer([find, runNode], 0) };
  }
  const snapshot = { kind: "tool_call", callId: "read.cart.26", toolId: "core.run_node", input: { node: "lib.output.snapshot", parameters: {}, consequences: [] } };

  it("the narrowed node list says which actions it left out, and only those", () => {
    const { offered } = withdrawn();
    const node = (offered[0]!.inputSchema.properties as JsonObject).node;
    expect(automationStudioLlmEvidenceWithdrawnActions(node)).toEqual(["lib.output.snapshot"]);
    expect(automationStudioLlmEvidenceWithdrawnActions((runNode.inputSchema.properties as JsonObject).node)).toEqual([]);
  });

  it("is passed on by the adapter, and the loop's own check refuses it as a withdrawn look", () => {
    const { looks, offered } = withdrawn();
    expect(offered.map((tool) => tool.toolId)).toEqual(["core.run_node"]);
    expect(thrownBy(() => automationStudioAnthropicTaskAnswer(reply(snapshot), offering(offered), USAGE, 300))).toBeUndefined();
    const answer = automationStudioAnthropicTaskAnswer(reply(snapshot), offering(offered), USAGE, 300);
    const result = parseAutomationStudioLlmProviderResult({ response: answer }, "evidence_tool_decision", undefined, offered);
    expect(result.diagnostics.filter((one) => one.severity === "error")).toEqual([]);
    const parsed = automationStudioLlmEvidenceParseDecision((result.response as { decision: unknown }).decision);
    expect(parsed).toMatchObject({ kind: "tool_call", toolId: "core.run_node", input: { node: "lib.output.snapshot" } });
    expect(looks.refuses(runNode, (parsed as { input: JsonObject }).input, 0)).toBe(true);
    expect(looks.refusalCode(0)).toBe("llm_evidence_loop.look_withdrawn");
  });

  it("every other key of the call is still held to the variant, and a node never offered is still refused", () => {
    const { offered } = withdrawn();
    const extra = thrownBy(() => automationStudioAnthropicTaskAnswer(reply({ ...snapshot, input: { ...snapshot.input, page: 2 } }), offering(offered), USAGE, 300));
    expect(extra?.code).toBe("llm.provider_output_invalid");
    expect(extra?.reply?.misses).toEqual([{ path: "response.decision.input.page", rule: "is not a key this object takes" }]);
    const unknown = thrownBy(() => automationStudioAnthropicTaskAnswer(reply({ ...snapshot, input: { ...snapshot.input, node: "lib.output.capture" } }), offering(offered), USAGE, 300));
    expect(unknown?.code).toBe("llm.provider_output_invalid");
  });
});
