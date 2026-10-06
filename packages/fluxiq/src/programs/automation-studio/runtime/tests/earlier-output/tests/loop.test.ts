// An earlier step's output, written by the model in the loop (P5, t270, t273).
//
// The model writes a step (`core.run_node` with write true) whose parameter
// is `{"$step": n, "output": "<port>", "path": "<field>"}`. The loop reads it
// against the draft as it stands (`../../../llm/evidence-loop.ts`,
// `../../../llm/evidence-loop-decision.ts`): n becomes the earlier step's own
// id before the call is sent, the step is stored holding that binding, and the
// build's test sends the value that step answered in the test
// (`./replay.test.ts`). A step that does not exist yet -- this one or a later
// one -- or one the model withdrew, or an output its node does not declare, is
// refused with its `run_node.binding_refused.step_*` code, and nothing is sent.
// The llm barrel first, as `../../../llm/decision-context/tests/recorded-runs.ts` says why.
import { describe, expect, it, vi } from "vitest";
import {
  AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID,
  AUTOMATION_STUDIO_NODE_WRITTEN_CODE,
  automationStudioLlmRunNodeTool,
  replayAutomationStudioFlowDraft,
  runAutomationStudioLlmEvidenceLoop,
  type AutomationStudioLlmEvidenceToolExecutionResult
} from "../../../llm/index.ts";
import type { JsonObject } from "../../../../../../core/index.ts";

const REPLAYED = "core.replay.replayed";
/** A written call whose binding cannot be read (`../../../llm/evidence-loop-decision.ts`), which the llm barrel does not export. */
const AUTOMATION_STUDIO_LLM_EVIDENCE_BINDING_REFUSED_CODE = "run_node.binding_refused";
const LIST = "node.list";
const TYPE = "node.type";

/** What the loop and the test read of a node: its ports. */
const NODES: Record<string, { inputs: { id: string }[]; outputs: { id: string; type: string }[] }> = {
  [LIST]: { inputs: [], outputs: [{ id: "records", type: "array" }, { id: "first", type: "object" }] },
  [TYPE]: { inputs: [], outputs: [] }
};
const nodeOf = (id: string) => NODES[id];

const runNode = automationStudioLlmRunNodeTool({ nodeIds: [LIST, TYPE] })!;
const stalled = () => new Error("stalled");
const complete = { kind: "complete", result: { flow: "ready" } };
const listCall = (callId: string, list = ".rows") => ({ kind: "tool_call", callId, toolId: AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID, input: { node: LIST, parameters: { list }, consequences: [] }, add: true });
const typeCall = (callId: string, text: JsonObject) => ({ kind: "tool_call", callId, toolId: AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID, input: { node: TYPE, parameters: { selector: "#name", text }, consequences: [], write: true } });
const drop = (step: number) => ({ kind: "amend_draft", amendments: [{ step, change: "drop" }] });

type Call = { callId: string; toolId?: string; value: JsonObject };

/**
 * The host while the model explores: a read runs and is kept, a written call
 * is checked and frozen as it was sent, as the domain does, and answers the
 * written code.
 */
function exploring() {
  const calls: Call[] = [];
  const executeTool = async (call: Call): Promise<JsonObject> => {
    calls.push(structuredClone(call));
    const { write, ...sent } = call.value;
    const node = String(sent.node);
    const from = { location: `https://site.test/${calls.length}` };
    if (write === true) {
      return {
        kind: "llm_evidence_tool_execution", evidence: { ok: true, written: true }, effectApplied: false, resultCode: AUTOMATION_STUDIO_NODE_WRITTEN_CODE,
        draft: { actionId: node, input: sent, ranWith: sent, effect: "mutate", proposes: true, written: true, replay: { from } }
      };
    }
    return {
      kind: "llm_evidence_tool_execution", evidence: { ok: true, rows: 1 }, effectApplied: true,
      draft: { actionId: node, input: sent, ranWith: sent, effect: "observe", proposes: true, replay: { from, produced: { first: { label: "Explored" } } } }
    };
  };
  return { calls, executeTool };
}

/** The host while the build tests the draft: each call answered by its id, the read with fresh outputs. */
function testing(outputs: Record<string, JsonObject>) {
  const calls: Call[] = [];
  const executeTool = async ({ callId, value }: Call): Promise<AutomationStudioLlmEvidenceToolExecutionResult> => {
    calls.push({ callId, value });
    if (value.replay === "reset") return { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, resultCode: REPLAYED };
    return { kind: "llm_evidence_tool_execution", evidence: { call: callId }, effectApplied: true, resultCode: REPLAYED, ...(outputs[callId] ? { outputs: outputs[callId] } : {}) };
  };
  return { calls, executeTool };
}

const loop = (decide: ReturnType<typeof vi.fn>, host: ReturnType<typeof exploring>) => runAutomationStudioLlmEvidenceLoop({
  tools: [runNode], decide, executeTool: host.executeTool, nodeOf, maxIterations: 10, maxToolCalls: 6, dryRun: false, unusableDecisions: { stalled, maxConsecutive: 6 }
});

type Shown = ReadonlyArray<{ toolId: string; value: JsonObject }>;
const decisionCheck = (decide: ReturnType<typeof vi.fn>, index: number) =>
  ((decide.mock.calls[index]![0] as { evidence: Shown }).evidence).find((entry) => entry.toolId === "core.decision_check")?.value;

describe("a written step that reads an earlier step's output", () => {
  it("is accepted, stored holding the earlier step's own id, and sent that step's real output in the build's test", async () => {
    const host = exploring();
    const decide = vi.fn()
      .mockResolvedValueOnce(listCall("c1"))
      .mockResolvedValueOnce(typeCall("c2", { $step: 1, output: "first", path: "label" }))
      .mockResolvedValueOnce(complete);
    const result = await loop(decide, host);

    expect(result.ok).toBe(true);
    const listed = result.steps[0]!;
    const bound = { $state: { path: `$step.${listed.id}.first.label` } };
    // Translated once, before the call was sent: the host never sees the model's form.
    expect(host.calls[1]!.value).toEqual({ node: TYPE, parameters: { selector: "#name", text: bound }, consequences: [], write: true });
    expect(result.steps.map((step) => [step.actionId, step.disposition, step.written])).toEqual([[LIST, "kept", undefined], [TYPE, "kept", true]]);
    expect(result.steps[1]!.ranWith).toEqual({ node: TYPE, parameters: { selector: "#name", text: bound }, consequences: [] });

    const test = testing({ "dryrun.1.1": { records: [{ name: "Ada" }], first: { label: "Fresh" } } });
    const replayed = await replayAutomationStudioFlowDraft({ steps: result.steps, attempt: 1, executeTool: test.executeTool, nodeOf });
    expect(replayed.verdict.ok).toBe(true);
    // What the read answered in this test, never what it produced while exploring.
    expect(test.calls.find((call) => call.callId === "dryrun.1.2")!.value.parameters).toEqual({ selector: "#name", text: "Fresh" });
  });

  it("is refused, unsent, when it reads itself, a later step, a withdrawn step or an output the node does not declare", async () => {
    const host = exploring();
    const decide = vi.fn()
      .mockResolvedValueOnce(listCall("c1"))
      .mockResolvedValueOnce(listCall("c2", ".cards"))
      .mockResolvedValueOnce(drop(2))
      // The written step would be step 3: itself, and step 4 after it, have produced nothing.
      .mockResolvedValueOnce(typeCall("c3", { $step: 3, output: "first" }))
      .mockResolvedValueOnce(typeCall("c4", { $step: 4, output: "first" }))
      .mockResolvedValueOnce(typeCall("c5", { $step: 2, output: "first" }))
      .mockResolvedValueOnce(typeCall("c6", { $step: 1, output: "label" }))
      .mockResolvedValueOnce(complete);
    const result = await loop(decide, host);

    expect(result.steps.map((step) => [step.position, step.disposition])).toEqual([[1, "kept"], [2, "dropped"]]);
    expect(host.calls.map((call) => call.callId)).toEqual(["c1", "c2"]);
    const refused = (index: number) => decisionCheck(decide, index)?.issueCodes;
    expect(refused(4)).toEqual([AUTOMATION_STUDIO_LLM_EVIDENCE_BINDING_REFUSED_CODE, `${AUTOMATION_STUDIO_LLM_EVIDENCE_BINDING_REFUSED_CODE}.step_missing:parameters.text`]);
    expect(refused(5)).toEqual([AUTOMATION_STUDIO_LLM_EVIDENCE_BINDING_REFUSED_CODE, `${AUTOMATION_STUDIO_LLM_EVIDENCE_BINDING_REFUSED_CODE}.step_missing:parameters.text`]);
    expect(refused(6)).toEqual([AUTOMATION_STUDIO_LLM_EVIDENCE_BINDING_REFUSED_CODE, `${AUTOMATION_STUDIO_LLM_EVIDENCE_BINDING_REFUSED_CODE}.step_not_usable:parameters.text`]);
    expect(refused(7)).toEqual([AUTOMATION_STUDIO_LLM_EVIDENCE_BINDING_REFUSED_CODE, `${AUTOMATION_STUDIO_LLM_EVIDENCE_BINDING_REFUSED_CODE}.step_output_unknown:parameters.text`]);
    // The model is told the form it may write, not that it is unavailable.
    const told = String(decisionCheck(decide, 7)?.instruction);
    expect(told).toContain("{\"$step\": <n>, \"output\": \"<output id>\"}");
    expect(told).not.toContain("not available yet");
  });
});
