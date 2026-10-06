// An act moved off a step that stays in the Flow is told to the model, on the
// two paths that move one, both answered by `../amendment.ts`: an amendment and a
// call written into the Flow with its act (`../../evidence-loop.ts`). Live run
// `run-musp4h2f-72e8ed99` moved a3 at step 0144 by a `core.run_node` write with
// `act a3`, and the 3-Pack press it left was pressed again in the next test.
// Information only: the move stands, nothing is refused, nothing is dropped.
import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { runAutomationStudioLlmEvidenceLoop } from "../../index.ts";

const go = { toolId: "go", description: "Go or press.", inputSchema: { type: "object" }, effect: "mutate" as const };
const stalled = () => new Error("stalled");
const complete = { kind: "complete", result: { flow: "ready" } };
const worked = { kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true, draft: { actionId: "web.dom.click" } };
const call = (index: number, over: JsonObject = {}) => ({ kind: "tool_call", callId: `call.${index}`, toolId: "go", input: { target: `#t${index}` }, ...over });
type Shown = ReadonlyArray<{ toolId: string; value: JsonObject }>;
const shownAt = (decide: { mock: { calls: unknown[][] } }, index: number): Shown => (decide.mock.calls[index]![0] as { evidence: Shown }).evidence;
const feedbackAt = (decide: { mock: { calls: unknown[][] } }, index: number) => shownAt(decide, index).find((entry) => entry.toolId === "core.amendment_check")?.value;

const run = async (decisions: JsonObject[], calls: number) => {
  const decide = vi.fn();
  for (const decision of decisions) decide.mockResolvedValueOnce(decision);
  decide.mockResolvedValueOnce(complete);
  const executeTool = vi.fn();
  for (let index = 0; index < calls; index += 1) executeTool.mockResolvedValueOnce(worked);
  const result = await runAutomationStudioLlmEvidenceLoop({ tools: [go], decide, executeTool, maxIterations: 8, maxToolCalls: 8, dryRun: false, unusableDecisions: { stalled } });
  return { result, decide };
};

describe("an act moved off a step left in the Flow", () => {
  it("is told after a call written into the Flow with that act", async () => {
    const { result, decide } = await run([call(1, { add: true, act: "a3" }), call(2, { add: true, act: "a3" })], 2);
    expect(result.steps.map((step) => [step.position, step.disposition, step.acts])).toEqual([[1, "kept", undefined], [2, "kept", ["a3"]]]);
    expect(feedbackAt(decide, 2)).toMatchObject({
      ok: true,
      code: "llm_evidence_loop.draft_act_moved",
      refused: [],
      moved: [{ step: 1, act: "a3", to: 2, note: expect.stringContaining("Step 1 no longer does a3: step 2 does it now.") }]
    });
  });

  it("is not told when the first claim of an act moved nothing", async () => {
    const { decide } = await run([call(1, { add: true, act: "a3" }), call(2, { add: true })], 2);
    expect(feedbackAt(decide, 2)).toBeUndefined();
  });

  it("is told after an amendment that only moved it, though nothing was refused", async () => {
    const { result, decide } = await run([call(1, { add: true, act: "a3" }), call(2), { kind: "amend_draft", amendments: [{ step: 2, change: "add", act: "a3" }] }], 2);
    expect(result.steps.find((step) => step.position === 1)).toMatchObject({ disposition: "kept" });
    expect(feedbackAt(decide, 3)).toMatchObject({ ok: true, code: "llm_evidence_loop.draft_act_moved", applied: 1, moved: [{ step: 1, act: "a3", to: 2 }] });
  });

  it("is told beside a refusal of the same decision", async () => {
    const { decide } = await run([call(1, { add: true, act: "a3" }), call(2), { kind: "amend_draft", amendments: [{ step: 2, change: "add", act: "a3" }, { step: 9, change: "drop" }] }], 2);
    expect(feedbackAt(decide, 3)).toMatchObject({ code: "llm_evidence_loop.draft_amendments_refused", refused: [{ step: 9, reason: "no_such_step" }], moved: [{ step: 1, act: "a3", to: 2 }] });
  });
});
