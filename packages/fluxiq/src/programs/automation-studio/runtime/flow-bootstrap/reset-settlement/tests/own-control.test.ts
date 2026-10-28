import { describe, expect, it } from "vitest";
import {
  AutomationStudioSiteResetControlTracker,
  AutomationStudioSiteResetObservations,
  AutomationStudioSiteResetReach,
  AutomationStudioSiteResetSettlementJudge,
  automationStudioSiteResetOwnControlStanding as ownControl,
  automationStudioSiteResetSettleWords as settleWords,
  type AutomationStudioSiteResetJudgedAct
} from "../index.ts";

// Where an act's own control stands, the one answer the undo admission and the settlement both read (t772, rerun round 6
// debug, cause 1), and the closure it makes possible: an act whose own control a fresh read shows back at the state the
// build found, while the control witness it is judged on stays open, is closed (`already_back`), never left open as a
// press to make. Made-up fixture: a library catalogue whose entries a reader reserves; opaque tokens only.

const RESERVE = { place: "pl:reserve-2", from: "st:free", to: "st:held" };

describe("an act's own control, per one read", () => {
  it("reads one control's declared state: back, set, a third state, or another place", () => {
    expect(ownControl(RESERVE, { place: "pl:reserve-2", state: "st:free" })).toBe("back");
    expect(ownControl(RESERVE, { place: "pl:reserve-2", state: "st:held" })).toBe("set");
    expect(ownControl(RESERVE, { place: "pl:reserve-2", state: "st:waitlisted" })).toBe("other");
    expect(ownControl(RESERVE, { place: "pl:reserve-2", state: undefined })).toBe("other");
    expect(ownControl(RESERVE, { place: "pl:reserve-1", state: "st:free" })).toBe("elsewhere");
    expect(ownControl(RESERVE, { place: undefined, state: "st:free" })).toBe("elsewhere");
  });

  it("reads a page's counts at its place against what the build found there, on the toggle's own two states only", () => {
    const found = { "st:free": 2, "st:held": 1, "st:note": 1 };
    // Another view of the place shows one more note: no effect of the act.
    expect(ownControl(RESERVE, { place: "pl:reserve-2", counts: { "st:free": 2, "st:held": 1, "st:note": 2 }, found })).toBe("back");
    expect(ownControl(RESERVE, { place: "pl:reserve-2", counts: { "st:free": 1, "st:held": 2, "st:note": 1 }, found })).toBe("set");
    expect(ownControl(RESERVE, { place: "pl:reserve-2", counts: { "st:free": 2, "st:note": 1 }, found })).toBe("other");
    expect(ownControl(RESERVE, { place: "pl:reserve-1", counts: found, found })).toBe("elsewhere");
  });
});

function judged() {
  const tracker = new AutomationStudioSiteResetControlTracker();
  const acts: AutomationStudioSiteResetJudgedAct[] = [];
  const state = { clock: 0 };
  const receipts = { named: () => undefined, described: () => undefined, issuedRefs: () => [] };
  const judge = new AutomationStudioSiteResetSettlementJudge({ seen: new AutomationStudioSiteResetObservations(), tracker, reach: new AutomationStudioSiteResetReach(), receipts, acts: () => acts, clock: () => state.clock, explored: () => [] });
  return { tracker, acts, state, judge };
}

describe("an act whose own control is back while its witness stays open is closed (t772)", () => {
  // The shape a pass's original had before t772: filed under another entry's place, while its own press sat at its own.
  const filedElsewhere = () => {
    const { tracker, acts, state, judge } = judged();
    tracker.read({ resource: "r:library", scope: "p:entry-2", location: "loc:entry-2", controls: { "pl:reserve-2": { "st:free": 1 } } }, 0);
    state.clock = 1;
    const press = tracker.landed("p:entry-2", "pl:reserve-2", { "st:free": 1 }, { "st:held": 1 }, 1, "loc:entry-2");
    const act: AutomationStudioSiteResetJudgedAct = {
      id: "act-1", spot: { resource: "r:library", page: "p:entry-2", state: "st:free" }, destinations: [], repeats: [], clock: 1, press, changeSeen: false, attempts: 0,
      controlOriginal: { resource: "r:library", page: "p:entry-2", place: "pl:reserve-1", before: { "st:free": 1 }, location: "loc:entry-2", at: "loc:entry-2" }
    };
    acts.push(act);
    return { tracker, state, judge, act };
  };

  it("never asks to press back a control a fresh read shows as the build found it: no call can settle it, named already back", () => {
    const { tracker, state, judge, act } = filedElsewhere();
    // Its undo landed and a fresh read of its own entry shows the entry free again.
    act.attempts = 1;
    state.clock = 2;
    tracker.read({ resource: "r:library", scope: "p:entry-2", location: "loc:entry-2", controls: { "pl:reserve-2": { "st:free": 1 } } }, 2);
    expect(judge.toggleOf(act)).toMatchObject({ place: "pl:reserve-2", from: "st:free", to: "st:held" });
    const decision = judge.evaluate(act);
    expect(decision).toEqual({ kind: "open", reasons: [{ reason: "own_back", witness: "toggle", location: "loc:entry-2" }] });
    expect(judge.unmet(act, () => undefined)).toBe("already_back");
    expect(judge.settle(act)).toContain("no call can settle it in this build");
    expect(judge.settle(act)).not.toContain("press that same control back");
  });

  it("still asks to press it back while a fresh read shows the state the act set, and reads it again when the read is stale", () => {
    const { tracker, state, judge, act } = filedElsewhere();
    tracker.read({ resource: "r:library", scope: "p:entry-2", location: "loc:entry-2", controls: { "pl:reserve-2": { "st:held": 1 } } }, 1);
    expect(judge.evaluate(act)).toMatchObject({ kind: "open", reasons: [{ reason: "toggle" }] });
    expect(judge.unmet(act, () => undefined)).toBeUndefined();
    // A later lasting call: the read is stale, so nothing closes it.
    state.clock = 2;
    expect(judge.evaluate(act)).toMatchObject({ kind: "open", reasons: [{ reason: "look" }] });
  });

  it("words the closed reason without a press to make", () => {
    expect(settleWords([{ reason: "own_back", witness: "toggle", location: "loc:entry-2" }], [])).toBe("Its own control at loc:entry-2 already shows the state the build found it in, so there is nothing to press back, but the control it is judged on does not show it put back: no call can settle it in this build.");
  });
});
