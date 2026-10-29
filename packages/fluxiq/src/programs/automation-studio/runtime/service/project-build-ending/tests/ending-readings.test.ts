import { describe, expect, it } from "vitest";
import { automationStudioProjectBuildEndingTold, automationStudioProjectBuildReadingsTold, automationStudioProjectBuildRecordTold, automationStudioProjectBuildTestsRefused } from "../index.ts";

// t791: a failed build's ending was the supervisor's unchecked claim, and "every test refused" read as "nothing read
// afterwards could show". A library stands in for the site: the build places a hold and saves a search.

const LEFT = { note: "Still on the target from this build: act-1.", told: "These changes the build made are still on the site: placed a hold and saved a search." };
const READING = { added: ["Hold placed until Friday", "Saved searches (2)"], gone: ["Place a hold"] };
const UNWITNESSED = "a step that changes something has not said where its change shows";

describe("an ending grounded in Core's latest readings", () => {
  it("drops the supervisor's claim of the site's state that the readings contradict, and says the readings", () => {
    const told = automationStudioProjectBuildEndingTold({
      reason: "The hold was not placed and the saved searches list is empty. I could not confirm where the change shows.",
      left: LEFT,
      readings: [READING]
    });
    expect(told.text).not.toMatch(/not placed|is empty/u);
    expect(told.text).toContain("I could not confirm where the change shows.");
    expect(told.text).toContain("Core last read the page as it now shows “Hold placed until Friday”, “Saved searches (2)” and no longer shows “Place a hold”.");
    expect(told.text.endsWith(LEFT.told)).toBe(true);
  });

  it("keeps a state claim no reading speaks of, and says nothing extra without a reading", () => {
    const reason = "The renewal date was not shown.";
    expect(automationStudioProjectBuildEndingTold({ reason, left: undefined, readings: [READING] }).why).toBe(reason);
    expect(automationStudioProjectBuildEndingTold({ reason, left: undefined }).text).toBe(`${reason} The build left no change on the site that it knows of.`);
    expect(automationStudioProjectBuildReadingsTold([{ added: [], gone: [] }])).toBeUndefined();
  });

  it("names a few lines and counts the rest", () => {
    const told = automationStudioProjectBuildReadingsTold([{ added: ["a one", "b two", "c three", "d four", "e five", "f six"], gone: [] }]);
    expect(told).toBe("Where the build acted, Core last read the page as it now shows “a one”, “b two”, “c three”, “d four” and 2 more.");
  });
});

describe("an ending where every test was refused", () => {
  const events = [
    { detail: { ref: "core.test_subflow", status: "started", text: undefined } },
    { detail: { ref: "core.test_subflow", status: "failed", text: `Result: subflow.trial_step_unwitnessed · Declined: ${UNWITNESSED}` } },
    { detail: { ref: "core.test_subflow", status: "failed", text: `Declined: ${UNWITNESSED}` } },
    { detail: { ref: "core.submit_subflow", status: "failed", text: "Declined: the steps could not be saved" } },
    { detail: { ref: "core.test_subflow", status: "failed", text: "Said: the Flow ran, but it did not do what you asked" } }
  ];

  it("counts only refused tests and keeps each reason once", () => {
    const tally = automationStudioProjectBuildTestsRefused();
    for (const event of events) tally.observe(event);
    expect(tally.told()).toEqual({ count: 2, why: [UNWITNESSED] });
  });

  it("says plainly that none ran, and why", () => {
    const said = automationStudioProjectBuildRecordTold({ parts: new Map(), assembled: true, refused: { count: 2, why: [UNWITNESSED] } });
    expect(said).toBe(`All 2 tests the build asked for were refused, so no test of the Flow ran: Core would not run them because ${UNWITNESSED}.`);
    expect(automationStudioProjectBuildRecordTold({ parts: new Map(), assembled: false, refused: { count: 1, why: [] } })).toBe("The one test the build asked for was refused, so no test of the Flow ran.");
    const told = automationStudioProjectBuildEndingTold({ reason: "The hold could not be confirmed.", left: LEFT, record: said });
    expect(told.text).toBe(`The hold could not be confirmed. ${said} ${LEFT.told}`);
  });

  it("leaves the account alone when a test did run", () => {
    const said = automationStudioProjectBuildRecordTold({ parts: new Map([["hold", { count: 1, last: "yes", passed: true }]]), assembled: true, refused: { count: 3, why: ["x"] } });
    expect(said).toBe("The one part tested on its own passed its own test. A whole Flow was assembled and never tested from its start.");
  });
});
