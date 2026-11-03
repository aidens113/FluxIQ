import { describe, expect, it } from "vitest";
import { automationStudioProjectBuildEndingTold } from "../ending-told.ts";

const RECORD = "All 2 parts were tested on their own and passed.";

describe("a done build's why from Core's record", () => {
  it("composes the why from the record when the supervisor gave no reason, saying it once", () => {
    for (const reason of [undefined, "", "   "]) {
      const told = automationStudioProjectBuildEndingTold({ reason, left: undefined, record: RECORD });
      expect(told.why).toBe(RECORD);
      expect(told.text).toBe(`${RECORD} The build left no change on the site that it knows of.`);
      expect(told.text.split(RECORD)).toHaveLength(2);
    }
  });

  it("composes the why from the record when the reason reduces to nothing", () => {
    const told = automationStudioProjectBuildEndingTold({ reason: "I could not finish this.", left: undefined, record: RECORD });
    expect(told.why).toBe(RECORD);
    expect(told.text.split(RECORD)).toHaveLength(2);
  });

  it("keeps the supervisor's reason, with the record after it, when one exists", () => {
    const told = automationStudioProjectBuildEndingTold({ reason: "The board is saved.", left: undefined, record: RECORD });
    expect(told.why).toBe("The board is saved.");
    expect(told.text).toBe(`The board is saved. ${RECORD} The build left no change on the site that it knows of.`);
  });

  it("has no why when there is neither a reason nor a record", () => {
    expect(automationStudioProjectBuildEndingTold({ reason: undefined, left: undefined }).why).toBeUndefined();
  });
});
