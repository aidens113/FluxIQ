import { describe, expect, it } from "vitest";
import { automationStudioActivityRunUncertainEnding } from "../run-uncertain.ts";

// t412: a run stopped as Outcome uncertain ends on "Stopped", never "Run failed".
describe("automationStudioActivityRunUncertainEnding", () => {
  const said = { title: "Stopped", label: "Stopped: not sure the last step went through, so it was not repeated.", text: "not sure the last step went through, so it was not repeated." };

  it("says the run stopped rather than repeat a step that may have gone through, from the trace's closed code", () => {
    expect(automationStudioActivityRunUncertainEnding({ failure: { code: "run.outcome_uncertain" } }, null)).toEqual(said);
  });

  it("reads the run record's stop code when the session carries no trace failure", () => {
    expect(automationStudioActivityRunUncertainEnding(undefined, { stopCode: "run.outcome_uncertain" })).toEqual(said);
  });

  it("says nothing for any other code, nor for a code that only ends the same way", () => {
    expect(automationStudioActivityRunUncertainEnding({ failure: { code: "web.action.timeout" } }, {})).toBeUndefined();
    expect(automationStudioActivityRunUncertainEnding({ failure: { code: "other.outcome_uncertain" } }, { stopCode: "x.outcome_uncertain" })).toBeUndefined();
    expect(automationStudioActivityRunUncertainEnding(null, undefined)).toBeUndefined();
  });

  it("fits the status line", () => {
    expect(said.label.length).toBeLessThanOrEqual(160);
  });
});
