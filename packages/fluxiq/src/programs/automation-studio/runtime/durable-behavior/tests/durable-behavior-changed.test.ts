import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY } from "../../recovery/refuted-result/index.ts";
import { automationStudioRunChangedDurableBehavior } from "../durable-behavior-changed.ts";

// `durable-behavior-changed.ts`: the one reading of "this run changed the Flow".

const detail = (adaptationIds: string[] | undefined, runtimePatchAttempts?: unknown) => ({
  ...(adaptationIds ? { adaptationIds } : {}),
  ...(runtimePatchAttempts !== undefined ? { metadata: { runtimePatchAttempts } as JsonObject } : {})
});

describe("whether a run changed its Flow's durable behavior", () => {
  it("is true when one of the run's adaptations was applied automatically", () => {
    expect(automationStudioRunChangedDurableBehavior(detail(["a.one", "a.two"], [
      { adaptationId: "a.one", approvalDecision: { autoApply: false } },
      { adaptationId: "a.two", approvalDecision: { autoApply: true } }
    ]))).toBe(true);
  });

  // t249: an unattended apply waits for the run's judged end. Until then the
  // decision says `applied: false`, and the Flow has not changed.
  it("is false for an unattended apply still waiting for, or refused by, the run's judged end", () => {
    expect(automationStudioRunChangedDurableBehavior(detail(["a.one"], [{ adaptationId: "a.one", approvalDecision: { autoApply: true, applyAt: "judged_whole_run", applied: false } }]))).toBe(false);
    expect(automationStudioRunChangedDurableBehavior(detail(["a.one"], [{ adaptationId: "a.one", approvalDecision: { autoApply: true, applied: false, notAppliedReason: "refuted" } }]))).toBe(false);
    expect(automationStudioRunChangedDurableBehavior(detail(["a.one"], [{ adaptationId: "a.one", approvalDecision: { autoApply: true, applyAt: "judged_whole_run", applied: true } }]))).toBe(true);
  });

  // C6 step 8: a fix the run held in place leaves its receipt on `inRunRepairs`,
  // read as a detached patch's receipt is: a change once its judged end kept it.
  it("reads a fix held in the run from its in-run receipt, once its judged end kept it", () => {
    const inRun = (approvalDecision: JsonObject) => ({ adaptationIds: ["a.one"], metadata: { inRunRepairs: [{ repairId: "repair.one", adaptationId: "a.one", outcome: "overlaid", approvalDecision }] } as JsonObject });

    expect(automationStudioRunChangedDurableBehavior(inRun({ autoApply: true, applyAt: "judged_whole_run", applied: false }))).toBe(false);
    expect(automationStudioRunChangedDurableBehavior(inRun({ autoApply: true, applyAt: "judged_whole_run", applied: false, notAppliedReason: "not_judged" }))).toBe(false);
    expect(automationStudioRunChangedDurableBehavior(inRun({ autoApply: true, applyAt: "judged_whole_run", applied: true }))).toBe(true);
    expect(automationStudioRunChangedDurableBehavior({ adaptationIds: ["a.one"], metadata: { inRunRepairs: "not a list" } as JsonObject })).toBe(false);
  });

  it("is false for an adaptation that waits for review", () => {
    expect(automationStudioRunChangedDurableBehavior(detail(["a.one"], [{ adaptationId: "a.one", approvalDecision: { autoApply: false } }]))).toBe(false);
    expect(automationStudioRunChangedDurableBehavior(detail(["a.one"], [{ adaptationId: "a.one" }]))).toBe(false);
  });

  it("is false for an auto-applied patch the run did not record as its adaptation", () => {
    expect(automationStudioRunChangedDurableBehavior(detail(["a.one"], [{ adaptationId: "a.other", approvalDecision: { autoApply: true } }]))).toBe(false);
    expect(automationStudioRunChangedDurableBehavior(detail([], [{ adaptationId: "a.one", approvalDecision: { autoApply: true } }]))).toBe(false);
  });

  it("is false when the run recorded no adaptations or no patch attempts, or they are malformed", () => {
    expect(automationStudioRunChangedDurableBehavior(detail(undefined))).toBe(false);
    expect(automationStudioRunChangedDurableBehavior(detail(["a.one"]))).toBe(false);
    expect(automationStudioRunChangedDurableBehavior(detail(["a.one"], "not a list"))).toBe(false);
    expect(automationStudioRunChangedDurableBehavior(detail(["a.one"], [null, 3, ["a.one"], { adaptationId: "a.one", approvalDecision: "yes" }]))).toBe(false);
  });

  // t267 S4: a re-author is a Flow Bootstrap adaptation, not among the run's
  // `adaptationIds`; it changed the Flow only once its marker says it was kept.
  const reauthor = (marker: unknown, adaptationIds: string[] = []) => ({ adaptationIds, metadata: { [AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY]: marker } as JsonObject });

  it("is true for a kept re-author, even when the run recorded no adaptations", () => {
    expect(automationStudioRunChangedDurableBehavior(reauthor({ adaptationId: "a.reauthor", applied: true }))).toBe(true);
    expect(automationStudioRunChangedDurableBehavior({ metadata: { [AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY]: { adaptationId: "a.reauthor", applied: true } } as JsonObject })).toBe(true);
    expect(automationStudioRunChangedDurableBehavior(reauthor({ adaptationId: "a.reauthor", applied: true }, ["a.one"]))).toBe(true);
  });

  it("is false for a re-author not kept, not settled, or malformed", () => {
    expect(automationStudioRunChangedDurableBehavior(reauthor({ adaptationId: "a.reauthor", applied: false, notAppliedReason: "refuted" }))).toBe(false);
    expect(automationStudioRunChangedDurableBehavior(reauthor({ adaptationId: "a.reauthor" }))).toBe(false);
    expect(automationStudioRunChangedDurableBehavior(reauthor({ applied: true }))).toBe(false);
    expect(automationStudioRunChangedDurableBehavior(reauthor({ adaptationId: 7, applied: true }))).toBe(false);
    expect(automationStudioRunChangedDurableBehavior(reauthor({ adaptationId: "a.reauthor", applied: "yes" }))).toBe(false);
    expect(automationStudioRunChangedDurableBehavior(reauthor([{ adaptationId: "a.reauthor", applied: true }]))).toBe(false);
    expect(automationStudioRunChangedDurableBehavior(reauthor(null))).toBe(false);
  });
});
