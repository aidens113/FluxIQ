// An amendment naming the step the same decision reruns is about the step that
// replaces it, so it waits for the rerun (`../held-amendments.ts`).
//
// Live run `run-mup2i28c-6c7fc209`, decision 5, sent `4 rerun` beside an act
// claimed on step 4. The claim was applied before the rerun ran, was judged on the failed
// press the rerun was replacing, and was refused `did_not_work` -- so a rerun's
// success could never carry its act in the same decision.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";
import type { AutomationStudioFlowDraftClaimRefused, AutomationStudioFlowDraftStep } from "../../../flow-authoring/draft/index.ts";
import { automationStudioLlmEvidenceHeldAmendments } from "../held-amendments.ts";
import { automationStudioLlmEvidenceRerunReplaced } from "../rerun/index.ts";

const go = { toolId: "go", description: "Go or press.", inputSchema: { type: "object" }, effect: "mutate" as const };
const stalled = () => new Error("stalled");
const complete = { kind: "complete", result: { flow: "ready" } };
const worked = { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, draft: { actionId: "web.dom.click" } };
const refused = { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "web.action.rejected.target_unobserved" }, effectApplied: false, resultCode: "web.action.rejected.target_unobserved", draft: { actionId: "web.dom.click" } };
const call = (index: number, over: JsonObject = {}) => ({ kind: "tool_call", callId: `call.${index}`, toolId: "go", input: { target: `#t${index}` }, ...over });
type Shown = ReadonlyArray<{ toolId: string; value: JsonObject }>;
const shownAt = (decide: { mock: { calls: unknown[][] } }, index: number): Shown => (decide.mock.calls[index]![0] as { evidence: Shown }).evidence;
const pressStep = (id: string, position: number, over: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep =>
  ({ position, id, iteration: position, actionId: "web.dom.click", toolId: "go", input: { target: `#${id}` }, effect: "mutate", effectApplied: true, disposition: "kept", ...over });

// Step 1 worked, step 2 refused, step 3 worked; then one decision reruns step 2 and names an act on both (`keep` with
// `act`, the framework's edit: every step that worked is in the Flow already, t1037).
const run = async (rerunOutcome: "worked" | "refused" | "threw", amendments: JsonObject[], draft?: { claimRefused: AutomationStudioFlowDraftClaimRefused }) => {
  const decide = vi.fn()
    .mockResolvedValueOnce(call(1, { add: true }))
    .mockResolvedValueOnce(call(2))
    .mockResolvedValueOnce(call(3))
    .mockResolvedValueOnce({ kind: "amend_draft", amendments })
    .mockResolvedValueOnce(complete);
  const executeTool = vi.fn().mockResolvedValueOnce(worked).mockResolvedValueOnce(refused).mockResolvedValueOnce(worked);
  if (rerunOutcome === "threw") executeTool.mockRejectedValueOnce(new Error("page gone"));
  else executeTool.mockResolvedValueOnce(rerunOutcome === "worked" ? worked : refused);
  const result = await runAutomationStudioLlmEvidenceLoop({ tools: [go], decide, executeTool, maxIterations: 8, maxToolCalls: 8, dryRun: false, unusableDecisions: { stalled }, ...(draft ? { draft } : {}) });
  return { result, decide };
};

const decision5 = [
  { step: 2, change: "rerun", input: { target: "#fixed" } },
  { step: 2, change: "keep", act: "a1" },
  { step: 3, change: "keep", act: "a2" }
];

describe("an amendment naming the step its decision reruns", () => {
  it.each(["drop", "repeat"] as const)("says a held %s refusal's repeat references in the numbers the model wrote, once the rerun took its step's place", (change) => {
    const entry = (id: string, position: number): AutomationStudioFlowDraftStep => ({
      id, position, iteration: position, actionId: "node", input: { id }, effect: "mutate", proposes: true, effectApplied: true, disposition: "kept"
    });
    const steps = [entry("start", 1), entry("source", 2), entry("head", 3), entry("last", 4), entry("other", 5)];
    steps[1]!.effect = "observe";
    steps[2]!.routing = { kind: "repeat", over: "source", through: "last" };
    const position = change === "drop" ? 2 : 4;
    const replaced = steps[position - 1]!;
    const held = automationStudioLlmEvidenceHeldAmendments([{ step: position, change: "rerun" }, { step: position, change }], steps, position);
    const rerun = { ...entry("fresh", 6), effect: replaced.effect };
    steps.push(rerun);
    automationStudioLlmEvidenceRerunReplaced(steps, replaced);
    expect(steps.find((step) => step.id === "head")!.position).toBe(3);
    expect(held.settle(steps, rerun)).toEqual({
      applied: 0, refused: [change === "drop"
        ? { step: 2, reason: "holds_a_repeat", repeat: 3, holds: "over" }
        : { step: 4, reason: "span_holds_routing", repeat: 3, through: 4, routed: 4 }]
    });
    expect(rerun.disposition).toBe("kept");
    expect(rerun.routing).toBeUndefined();
  });

  it("lands on the step that replaced it once the rerun has worked", async () => {
    const { result } = await run("worked", decision5);
    // The rerun d4 stands where step 2 stood, in the Flow and doing a1; d3 keeps its number, and
    // the refused press stays listed at the end as the rerun's receipt (`run-musp474o-e0ed7432`).
    expect(result.steps.map((step) => [step.id, step.position, step.disposition, step.acts])).toEqual([
      ["d1", 1, "kept", undefined],
      ["d4", 2, "kept", ["a1"]],
      ["d3", 3, "kept", ["a2"]],
      ["d2", 4, "taken", undefined]
    ]);
    // Nothing was refused, so nothing is told.
    expect(result.trace.some((row) => (row.amendmentsRefused ?? []).length > 0)).toBe(false);
  });

  it("is refused with the rerun's own outcome when the rerun did not work, and the others land as before", async () => {
    const { result, decide } = await run("refused", decision5);
    expect(result.steps.find((step) => step.id === "d3")).toMatchObject({ disposition: "kept", acts: ["a2"] });
    expect(result.steps.find((step) => step.id === "d4")).toMatchObject({ disposition: "taken", effectApplied: false });
    expect(result.steps.some((step) => step.acts?.includes("a1"))).toBe(false);
    // Recorded on the rerun's own row, and told to the model before it is asked again.
    const rerunRow = result.trace.find((row) => row.callId === "rerun.2");
    expect(rerunRow?.amendmentsRefused).toEqual([{ step: 2, reason: "did_not_work", nodeId: "web.dom.click" }]);
    const feedback = shownAt(decide, 4).find((entry) => entry.toolId === "core.amendment_check")?.value;
    expect(feedback).toMatchObject({ refused: [{ step: 2, reason: "did_not_work" }], applied: 1 });
  });

  it("is refused when the rerun threw", async () => {
    const { result, decide } = await run("threw", decision5);
    expect(result.steps.some((step) => step.acts?.includes("a1"))).toBe(false);
    const feedback = shownAt(decide, 4).find((entry) => entry.toolId === "core.amendment_check")?.value;
    expect(feedback).toMatchObject({ refused: [{ step: 2, reason: "did_not_work" }] });
  });

  // t285 gap 1: a held claim was applied without the act judge, so an act held for a rerun was claimed unasked.
  it("asks the act judge before a held act is claimed on the rerun, as an amendment applied at once is", async () => {
    const judge = vi.fn<AutomationStudioFlowDraftClaimRefused>((_steps, step, act) => act === "a1" ? { act, said: `Step ${step.position} only opened the page, and does not do a1.` } : undefined);
    const { result, decide } = await run("worked", decision5, { claimRefused: judge });
    expect(judge).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "d4" }), "a1");
    // The rerun stands in the Flow without a1; the add beside it still applied.
    expect(result.steps.find((step) => step.id === "d4")).toMatchObject({ disposition: "kept" });
    expect(result.steps.find((step) => step.id === "d4")?.acts).toBeUndefined();
    const rerunRow = result.trace.find((row) => row.callId === "rerun.2");
    expect(rerunRow?.amendmentsRefused).toEqual([expect.objectContaining({ step: 2, reason: "act_not_done_there", act: "a1", said: "Step 2 only opened the page, and does not do a1." })]);
    const feedback = shownAt(decide, 4).find((entry) => entry.toolId === "core.amendment_check")?.value;
    expect(feedback).toMatchObject({ refused: [{ step: 2, reason: "act_not_done_there", act: "a1" }] });
  });
});
