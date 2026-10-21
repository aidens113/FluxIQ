import { describe, expect, it } from "vitest";
import type { AutomationStudioActivityTimeLimitTried } from "../../../activity/index.ts";
import { automationStudioProjectBuildEndingTold, automationStudioProjectBuildRecordTold } from "../index.ts";

// t753, rerun round 5: a failed or partial build's ending said one verdict three times, contradicted itself and
// stuttered. A pin board stands in for the site: the build pins a note and saves the board.

const PASSED: AutomationStudioActivityTimeLimitTried = { count: 1, last: "yes", passed: true };
const QUIET_LEFT = "The build took 3 steps without a label, and nothing read afterwards could show whether they changed anything; check them if you need the site exactly as it was.";

describe("the one account of a project build's ending", () => {
  // Shape (b): "FluxIQ could not finish the Flow: I could not finish this. Saving ...".
  it("never opens the supervisor's reason on a sentence that only says it could not finish", () => {
    const told = automationStudioProjectBuildEndingTold({ reason: "I could not finish this. Saving the board left changes on the site that can no longer be checked or undone.", left: { note: "Still on the target from this build: act-1.", told: QUIET_LEFT } });
    expect(told.why).toBe("Saving the board left changes on the site that can no longer be checked or undone.");
    expect(told.text).toBe(`Saving the board left changes on the site that can no longer be checked or undone. ${QUIET_LEFT}`);
    expect(told.text).not.toMatch(/could not finish/iu);
    // A reason that is nothing but that sentence says no why at all.
    expect(automationStudioProjectBuildEndingTold({ reason: "I could not finish this.", left: undefined }).why).toBeUndefined();
  });

  it("says the supervisor's reason, then Core's record of its tests, then what is left, once each", () => {
    const record = automationStudioProjectBuildRecordTold({ parts: new Map([["pin", PASSED]]), assembled: true, whole: { verdict: "no", feedback: {} } });
    const told = automationStudioProjectBuildEndingTold({ reason: "The board refused the note because it was full. Still on the target from this build: act-1.", left: { note: "Still on the target from this build: act-1.", told: QUIET_LEFT }, record });
    expect(told.text).toBe(`The board refused the note because it was full. ${record} ${QUIET_LEFT}`);
    expect(told.text).not.toContain("act-1");
    // Nothing left: said once, in Core's words.
    expect(automationStudioProjectBuildEndingTold({ reason: "The board was full.", left: undefined }).text).toBe("The board was full. The build left no change on the site that it knows of.");
  });

  // Shape (a): "It was never test-run from the start" after two whole test runs, because the Flow was assembled again
  // after them and its latest version had no test of its own.
  it("never says the whole Flow was never tested when an earlier version of it was test-run whole", () => {
    const told = automationStudioProjectBuildRecordTold({ parts: new Map([["pin", PASSED]]), assembled: true, wholeRuns: { count: 2, last: "no" } })!;
    expect(told).not.toMatch(/never (?:tested|test-run)/u);
    expect(told).toBe("The one part tested on its own passed its own test. A version of the whole Flow was test-run from its start twice, and the last of those runs was judged not to do what was asked; the latest version was not tested from its start.");
    // With no whole run at all, it still says so.
    expect(automationStudioProjectBuildRecordTold({ parts: new Map([["pin", PASSED]]), assembled: true, wholeRuns: { count: 0, last: "no" } })).toContain("never tested from its start");
  });
});
