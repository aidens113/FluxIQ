import { describe, expect, it } from "vitest";
import type { AutomationStudioActivityTimeLimitTried } from "../../../activity/index.ts";
import { automationStudioProjectBuildReasonChecked } from "../reason-checked.ts";
import { automationStudioProjectBuildRecordTold } from "../record-told.ts";

// t738, everything-store `run-mvgf04kw-310fc169`: the ending said "the part that reaches checkout never passed its
// own test" while that part's trial was judged yes. A recipe box stands in: its supervisor says the part that opens
// the box never passed its test, and Core's record holds that part's yes.

const PASSED: AutomationStudioActivityTimeLimitTried = { count: 3, last: "yes", passed: true };
const FAILING: AutomationStudioActivityTimeLimitTried = { count: 4, last: "no", passed: false };
const REASON = "I could not finish this. The automation that saves the soup recipe to your box could not be made to work: the part that saves it kept failing, and the part that opens the recipe box never passed its own test. Nothing was deleted.";

describe("a build's ending against Core's record", () => {
  it("leaves out the model's claims of how a part's test went, keeping the rest of what it said", () => {
    const checked = automationStudioProjectBuildReasonChecked(REASON);
    expect(checked).toBe("I could not finish this. The automation that saves the soup recipe to your box could not be made to work. Nothing was deleted.");
    expect(checked).not.toContain("never passed");
    // A reason that claims nothing of a part's test is said as it was.
    expect(automationStudioProjectBuildReasonChecked("The box answered that it is full, so no recipe could be saved.")).toBe("The box answered that it is full, so no recipe could be saved.");
    expect(automationStudioProjectBuildReasonChecked("One step never passed its test.")).toBe("");
  });

  it("says which parts passed their own test and what the judged run did and was judged, from the record", () => {
    const told = automationStudioProjectBuildRecordTold({
      parts: new Map([["open_box", PASSED], ["save_recipe", FAILING]]),
      assembled: true,
      whole: { verdict: "no", feedback: { steps: [{ step: 1, status: "succeeded" }, { step: 2, status: "succeeded" }, { step: 3, status: "succeeded" }], stored: { rows: 0, refused: 0, missingRequired: 0 } } }
    });
    expect(told).toBe("Of the 2 parts tested on their own, 1 passed its own test; left: a part tested 4 times whose last test was judged not to do what was asked. The judged test run of the whole Flow from its start ran all 3 of its steps and stored no rows, and was judged not to do what was asked.");
    expect(told).not.toContain("open_box");
    expect(automationStudioProjectBuildRecordTold({ parts: new Map([["open_box", PASSED], ["save_recipe", PASSED]]), assembled: false })).toBe("Both parts tested on their own passed their own test. No whole Flow was assembled, so it was never tested as one.");
  });

  it("says nothing when nothing was tested or assembled, and that no whole Flow was assembled when only parts were tried", () => {
    expect(automationStudioProjectBuildRecordTold({ parts: new Map(), assembled: false })).toBeUndefined();
    expect(automationStudioProjectBuildRecordTold({ parts: new Map([["open_box", PASSED]]), assembled: false }))
      .toBe("The one part tested on its own passed its own test. No whole Flow was assembled, so it was never tested as one.");
    expect(automationStudioProjectBuildRecordTold({ parts: new Map([["save_recipe", { count: 1, last: "execution_failed", passed: false }]]), assembled: true, whole: { verdict: "execution_failed", feedback: { steps: [{ status: "succeeded" }, { status: "failed" }] } } }))
      .toBe("The one part tested on its own did not pass its own test: it was tested once, and its last test did not run to its end. The judged test run of the whole Flow from its start ran 1 of its 2 steps, and did not run to its end.");
  });

  it("never prints a part's failed test the record contradicts, and says the record's facts in its place", () => {
    // The supervisor says the box-opening part never passed; Core's record holds its yes.
    const record = automationStudioProjectBuildRecordTold({ parts: new Map([["open_box", PASSED], ["save_recipe", FAILING]]), assembled: false })!;
    const said = `${automationStudioProjectBuildReasonChecked(REASON)} ${record}`;
    expect(said).not.toContain("never passed its own test");
    expect(said).not.toContain("kept failing");
    expect(said).toContain("Of the 2 parts tested on their own, 1 passed its own test;");
  });
});
