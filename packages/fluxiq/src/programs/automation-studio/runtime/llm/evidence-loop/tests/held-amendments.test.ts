// An amendment naming the step the same decision reruns is about the step that
// replaces it, so it waits for the rerun (`../held-amendments.ts`).
//
// Live run `run-mup2i28c-6c7fc209`, decision 5, sent `4 rerun` beside `4 add
// act a1`. The add was applied before the rerun ran, was judged on the failed
// press the rerun was replacing, and was refused `did_not_work` -- so a rerun's
// success could never carry its act in the same decision.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioLlmEvidenceHeldAmendments } from "../held-amendments.ts";
import { automationStudioLlmEvidenceRerunReplaced } from "../rerun-replacement.ts";

const go = { toolId: "go", description: "Go or press.", inputSchema: { type: "object" }, effect: "mutate" as const };
const stalled = () => new Error("stalled");
const complete = { kind: "complete", result: { flow: "ready" } };
const worked = { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, draft: { actionId: "web.dom.click" } };
const refused = { kind: "llm_evidence_tool_execution", evidence: { ok: false, code: "web.action.rejected.target_unobserved" }, effectApplied: false, resultCode: "web.action.rejected.target_unobserved", draft: { actionId: "web.dom.click" } };
const call = (index: number, over: JsonObject = {}) => ({ kind: "tool_call", callId: `call.${index}`, toolId: "go", input: { target: `#t${index}` }, ...over });
type Shown = ReadonlyArray<{ toolId: string; value: JsonObject }>;
const shownAt = (decide: { mock: { calls: unknown[][] } }, index: number): Shown => (decide.mock.calls[index]![0] as { evidence: Shown }).evidence;

// Step 1 added, step 2 refused, step 3 worked and not yet added; then one decision reruns step 2 and adds both.
const run = async (rerunOutcome: "worked" | "refused" | "threw", amendments: JsonObject[]) => {
  const decide = vi.fn()
    .mockResolvedValueOnce(call(1, { add: true }))
    .mockResolvedValueOnce(call(2))
    .mockResolvedValueOnce(call(3))
    .mockResolvedValueOnce({ kind: "amend_draft", amendments })
    .mockResolvedValueOnce(complete);
  const executeTool = vi.fn().mockResolvedValueOnce(worked).mockResolvedValueOnce(refused).mockResolvedValueOnce(worked);
  if (rerunOutcome === "threw") executeTool.mockRejectedValueOnce(new Error("page gone"));
  else executeTool.mockResolvedValueOnce(rerunOutcome === "worked" ? worked : refused);
  const result = await runAutomationStudioLlmEvidenceLoop({ tools: [go], decide, executeTool, maxIterations: 8, maxToolCalls: 8, dryRun: false, unusableDecisions: { stalled } });
  return { result, decide };
};

const decision5 = [
  { step: 2, change: "rerun", input: { target: "#fixed" } },
  { step: 2, change: "add", act: "a1" },
  { step: 3, change: "add", act: "a2" }
];

describe("an amendment naming the step its decision reruns", () => {
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

  it("keeps the position it named for another step, read in the numbering the model wrote it in", async () => {
    // Move the rerun to where step 3 stood when the model wrote it.
    const { result } = await run("worked", [{ step: 2, change: "rerun", input: { target: "#fixed" } }, { step: 2, change: "add", to: 3, act: "a1" }]);
    // Position 3 is where d3 stood, so the rerun goes after d3, not before it; the replaced
    // attempt d2 stays at the end, where a rerun's receipt goes (`run-musp474o-e0ed7432`).
    expect(result.steps.map((step) => [step.id, step.position])).toEqual([["d1", 1], ["d3", 2], ["d4", 3], ["d2", 4]]);
    expect(result.steps.find((step) => step.id === "d4")).toMatchObject({ disposition: "kept", acts: ["a1"] });
  });

  it("says a repeat its move took off in the numbers the model wrote, not the held amendment's", () => {
    // Step 2 repeats over the listing at 1 through step 3; the decision reruns step 3 and moves the
    // rerun to where step 2 stood, so step 2's span would end before it starts and is taken off.
    const press = (id: string, position: number): AutomationStudioFlowDraftStep => ({ position, id, iteration: position, actionId: "web.dom.click", input: { target: `#${id}` }, effect: "mutate", effectApplied: true, disposition: "kept" });
    const steps = [press("d1", 1), press("d2", 2), press("d3", 3)];
    steps[1]!.routing = { kind: "repeat", through: "d3", over: "d1" };
    const held = automationStudioLlmEvidenceHeldAmendments([{ step: 3, change: "rerun" }, { step: 3, change: "reorder", to: 2 }], steps, 3);
    const rerun = press("d4", 4);
    steps.push(rerun);
    automationStudioLlmEvidenceRerunReplaced(steps, steps[2], { takesItsPlace: true });
    const settled = held.settle(steps, rerun);
    expect(steps.map((step) => step.id)).toEqual(["d1", "d4", "d2", "d3"]);
    // The repeat was step 2's as the model wrote it, through step 3 (the number the rerun stands at);
    // step 2 is now 3 and the rerun 2.
    expect(settled).toEqual({ applied: 1, refused: [{ step: 2, reason: "repeat_taken_off", over: 1, through: 3, takenOff: "span_broken", now: 3, throughNow: 2 }] });
  });
});
