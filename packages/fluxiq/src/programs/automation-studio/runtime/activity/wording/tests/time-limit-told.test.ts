import { describe, expect, it } from "vitest";
import { automationStudioActivityTimeLimitTold } from "../time-limit-told.ts";

// What a build its time limit stopped says (t601, t608), and what it says of
// the whole Flow when the limit cut a test of it (G2, social
// `run-mvfq957o-40103539`): the build went back to a Flow it had tested whole
// several times, as a new revision, and the deadline cut that test off; the
// ending said the Flow was assembled and "never tested from its start".

const LIMIT_MS = 30 * 60_000;
const ONE_PART = ["main"];
const TRIED = new Map([["main", { count: 7, last: "unsure" as const, passed: false }]]);

describe("what a build its time limit stopped says", () => {
  it("says the limit, its parts and the whole Flow's last finished test", () => {
    expect(automationStudioActivityTimeLimitTold({ limitMs: LIMIT_MS, subflows: ONE_PART, trials: TRIED, assembled: { tested: "unsure" } })).toEqual({
      title: "The build reached its time limit of 30 minutes before a whole test of the Flow passed.",
      tested: "Its one part did not pass its own test. Left: a part tested 7 times whose last test could not be confirmed. "
        + "A whole Flow was assembled and tested from its start, and its last whole test could not be confirmed; it is kept as a draft, and nothing was put into the Flow."
    });
  });

  it("says a later test the limit cut after the Flow's last finished test, never that the Flow was never tested", () => {
    const told = automationStudioActivityTimeLimitTold({ limitMs: LIMIT_MS, subflows: ONE_PART, trials: TRIED, assembled: { tested: "unsure", cut: true } });
    expect(told.tested).toContain("A whole Flow was assembled and tested from its start, and its last finished whole test could not be confirmed; a later test of it was cut short by the time limit. It is kept as a draft, and nothing was put into the Flow.");
    expect(told.tested).not.toContain("never tested");
  });

  it("says a Flow whose only test the limit cut was cut short, not never tested", () => {
    const told = automationStudioActivityTimeLimitTold({ limitMs: LIMIT_MS, subflows: [], trials: new Map(), assembled: { tested: undefined, cut: true } });
    expect(told.tested).toBe("A whole Flow was assembled, and its test from its start was cut short by the time limit before it finished; it is kept as a draft, and nothing was put into the Flow.");
  });

  it("still says a Flow assembled and never tested as that, and one never assembled as that", () => {
    expect(automationStudioActivityTimeLimitTold({ limitMs: LIMIT_MS, subflows: [], trials: new Map(), assembled: { tested: undefined } }).tested)
      .toBe("A whole Flow was assembled and never tested from its start; it is kept as a draft, and nothing was put into the Flow.");
    expect(automationStudioActivityTimeLimitTold({ limitMs: 8_000, subflows: [], trials: new Map() })).toEqual({
      title: "The build reached its time limit of 8 seconds before a whole test of the Flow passed.",
      tested: "No plan of its parts was written, so nothing was tested."
    });
  });
});
