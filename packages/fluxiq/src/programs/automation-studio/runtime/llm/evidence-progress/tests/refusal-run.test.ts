// Decisions refused, or that changed nothing, for one reason in a row (`../refusal-run.ts`).
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_SAME_REFUSALS_IN_A_ROW, automationStudioLlmEvidenceRefusalRun } from "../index.ts";

describe("refusals of one kind in a row", () => {
  it("counts consecutive decisions refused for the same kind, and ends the round at three", () => {
    const run = automationStudioLlmEvidenceRefusalRun();
    expect([run.refused(4, "amendment:already_in_flow"), run.refused(5, "amendment:already_in_flow"), run.refused(6, "amendment:already_in_flow")]).toEqual([1, 2, 3]);
    expect(AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_SAME_REFUSALS_IN_A_ROW).toBe(3);
  });

  it("starts again on another kind, or after a decision between that was not refused", () => {
    const run = automationStudioLlmEvidenceRefusalRun();
    expect(run.refused(1, "a")).toBe(1);
    expect(run.refused(2, "b")).toBe(1);
    expect(run.refused(3, "b")).toBe(2);
    expect(run.refused(5, "b")).toBe(1);
  });

  it("counts one decision once, whatever part of it reports", () => {
    const run = automationStudioLlmEvidenceRefusalRun();
    expect(run.refused(1, "a")).toBe(1);
    expect(run.refused(2, "a")).toBe(2);
    expect(run.refused(2, "a")).toBe(2);
  });
});
