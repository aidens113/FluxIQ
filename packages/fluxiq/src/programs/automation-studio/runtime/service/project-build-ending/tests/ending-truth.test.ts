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
      .toBe("The judged test run of the whole Flow from its start ran 1 of its 2 steps, and did not run to its end.");
  });

  it("never prints a part's failed test the record contradicts, and says the record's facts in its place", () => {
    // The supervisor says the box-opening part never passed; Core's record holds its yes.
    const record = automationStudioProjectBuildRecordTold({ parts: new Map([["open_box", PASSED], ["save_recipe", FAILING]]), assembled: false })!;
    const said = `${automationStudioProjectBuildReasonChecked(REASON)} ${record}`;
    expect(said).not.toContain("never passed its own test");
    expect(said).not.toContain("kept failing");
    expect(said).toContain("Of the 2 parts tested on their own, 1 passed its own test;");
  });

  // t774 round 6: "The one part tested on its own did not pass its own test ... tested 6 times" and "The judged test run of
  // the whole Flow ... ran 11 of its 12 steps" described one set of tests twice, in build jargon.
  it("tells one test once when the only part tested and the whole run are the same test", () => {
    const part = { count: 6, last: "no", passed: false } as const;
    const told = automationStudioProjectBuildRecordTold({ parts: new Map([["only", part]]), assembled: true, whole: { verdict: "no", feedback: { steps: [{ status: "succeeded" }, { status: "failed" }] } } })!;
    expect(told).toContain("judged not to do what was asked");
    expect(told).toContain("6 times");
    expect(told).not.toMatch(/tested on its own/u);
    expect(told.match(/judged not/gu)).toHaveLength(1);
    const runs = automationStudioProjectBuildRecordTold({ parts: new Map([["only", part]]), assembled: false, wholeRuns: { count: 6, last: "no" } })!;
    expect(runs).not.toMatch(/tested on its own/u);
  });

  // t774 round 6: the overlay counted the Flow's steps ("Step 3 of 12") while the ending counted every pass of a repeat
  // ("ran all 13 of its steps"), unexplained, and left out the steps the listing had cut.
  it("counts the steps the listing cut, and says when a repeat's passes are counted", () => {
    const ok = (label: string) => ({ status: "succeeded", label });
    const looped = automationStudioProjectBuildRecordTold({ parts: new Map(), assembled: true, whole: { verdict: "no", feedback: { steps: [ok("open"), ok("read row"), ok("read row"), ok("read row")], stepsLeftOut: 2 } } })!;
    expect(looped).toContain("ran all 6 of its steps, counting each pass of a repeat");
    const plain = automationStudioProjectBuildRecordTold({ parts: new Map(), assembled: true, whole: { verdict: "no", feedback: { steps: [ok("open"), ok("read"), ok("save")] } } })!;
    expect(plain).toContain("ran all 3 of its steps");
    expect(plain).not.toContain("counting");
  });

  // t774 round 6 (`run-mvrj7qg8-c20c132e`): the reason said the run "stored too few posts" beside a record that it stored
  // the three rows the answer needed. A claim of how many rows were stored gives way to the record's count.
  it("leaves out a claim of how many rows were stored when the record says how many", () => {
    const reason = "I could not finish this. The whole test was judged not right because it stored too few posts. Nothing was deleted.";
    expect(automationStudioProjectBuildReasonChecked(reason, true)).toBe("I could not finish this. Nothing was deleted.");
    expect(automationStudioProjectBuildReasonChecked(reason)).toContain("stored too few posts");
    expect(automationStudioProjectBuildReasonChecked("The feed stopped loading, so nothing more could be read.", true)).toContain("feed stopped loading");
  });
});

// t796, a repeat's step that never ran on any pass was told as "ran all 25 of its steps": the count included merges and
// every pass, and the step missing from it was not named. A library stands in: a loan step that never ran.
describe("a judged run that left steps out", () => {
  const ok = (label: string) => ({ status: "succeeded", label });
  const run = (notRun: Array<Record<string, string | number | boolean | number[]>>, steps = [ok("open"), ok("find the book"), ok("find the book"), ok("find the book")]) =>
    automationStudioProjectBuildRecordTold({ parts: new Map(), assembled: true, whole: { verdict: "no", feedback: { steps, notRun, stored: { rows: 3 } } } })!;

  it("names a step that never ran on any pass, and does not say it ran all its steps", () => {
    const told = run([{ nodeId: "n1", label: "place the hold", reason: "unreached", passes: [1, 2, 3], of: 3, lasting: true, said: "x" }]);
    expect(told).toContain("its step “place the hold” never ran (on any of the 3 passes)");
    expect(told).not.toContain("ran all");
    expect(told).toContain("stored 3 rows");
  });

  it("names the passes a step did not run on", () => {
    const told = run([{ nodeId: "n1", label: "place the hold", reason: "guarded", passes: [2, 3], of: 3, lasting: true, said: "x" }]);
    expect(told).toContain("its step “place the hold” did not run on passes 2 and 3 of 3");
    expect(told).not.toContain("ran all");
  });

  it("is as before when the feedback lists none", () => {
    expect(run([], [ok("a"), ok("b"), ok("c")])).toContain("ran all 3 of its steps");
    expect(run([], [ok("a"), ok("b"), ok("c")])).not.toContain("never ran");
  });
});
