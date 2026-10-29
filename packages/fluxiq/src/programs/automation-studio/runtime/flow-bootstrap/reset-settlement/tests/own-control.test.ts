import { describe, expect, it } from "vitest";
import {
  AutomationStudioSiteResetControlTracker,
  AutomationStudioSiteResetObservations,
  AutomationStudioSiteResetReach,
  AutomationStudioSiteResetSettlementJudge,
  automationStudioSiteResetActOwnControl,
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

describe("an act's own control is judged at its one place (t772, t797 P4 item 1)", () => {
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
  /** Its original and its own press at one place, entry 2's Reserve. */
  const onePlace = () => {
    const made = filedElsewhere();
    made.act.controlOriginal = { ...made.act.controlOriginal!, place: "pl:reserve-2" };
    return made;
  };
  const read = (counts: Record<string, number> | undefined) => ({ resource: "r:library", scope: "p:entry-2", location: "loc:entry-2", controls: counts === undefined ? {} : { "pl:reserve-2": counts } });

  it("never takes a press read at another place than its original's as its toggle, and never asks for a press back there", () => {
    const { tracker, state, judge, act } = filedElsewhere();
    act.attempts = 1;
    state.clock = 2;
    tracker.read(read({ "st:free": 1 }), 2);
    expect(automationStudioSiteResetActOwnControl(act)).toMatchObject({ place: "pl:reserve-1", page: "p:entry-2", at: "loc:entry-2" });
    expect(judge.toggleOf(act)).toBeUndefined();
    // Its own place is not on the page its original was read on: no press back can be admitted, so it is closed.
    expect(judge.evaluate(act)).toEqual({ kind: "open", reasons: [{ reason: "control_other", witness: "toggle", location: "loc:entry-2" }] });
    expect(judge.unmet(act, () => undefined)).toBe("no_admissible_undo");
    expect(judge.settle(act)).toContain("no call can settle it in this build");
    expect(judge.settle(act)).not.toContain("press that same control back");
  });

  it("at one place: asks for a press back while a fresh read shows the state the act set, closes it on a third state or when gone, settles it when back", () => {
    for (const [counts, expected] of [
      [{ "st:held": 1 }, { kind: "open", reasons: [{ reason: "toggle", witness: "toggle", location: "loc:entry-2" }] }],
      [{ "st:waitlisted": 1 }, { kind: "open", reasons: [{ reason: "control_other", witness: "toggle", location: "loc:entry-2" }] }],
      [undefined, { kind: "open", reasons: [{ reason: "control_other", witness: "toggle", location: "loc:entry-2" }] }],
      [{ "st:free": 1 }, { kind: "settled", how: "restored" }]
    ] as const) {
      const { tracker, judge, act } = onePlace();
      tracker.read(read(counts === undefined ? undefined : { ...counts }), 1);
      expect(judge.toggleOf(act), JSON.stringify(counts)).toMatchObject({ place: "pl:reserve-2", from: "st:free", to: "st:held" });
      expect(judge.evaluate(act), JSON.stringify(counts)).toEqual(expected);
      const unmet = judge.unmet(act, () => undefined);
      expect(unmet, JSON.stringify(counts)).toBe(expected.kind === "open" && expected.reasons[0].reason === "control_other" ? "no_admissible_undo" : undefined);
    }
  });

  it("reads it again when the read is stale, and closes nothing on a stale read", () => {
    const { tracker, state, judge, act } = onePlace();
    tracker.read(read({ "st:waitlisted": 1 }), 1);
    state.clock = 2;
    expect(judge.evaluate(act)).toMatchObject({ kind: "open", reasons: [{ reason: "look" }] });
    expect(judge.unmet(act, () => undefined)).toBeUndefined();
  });

  it("words the closed reasons without a press to make", () => {
    expect(settleWords([{ reason: "own_back", witness: "toggle", location: "loc:entry-2" }], [])).toBe("Its own control at loc:entry-2 already shows the state the build found it in, so there is nothing to press back, but the control it is judged on does not show it put back: no call can settle it in this build.");
    expect(settleWords([{ reason: "control_other", witness: "toggle", location: "loc:entry-2" }], [])).toBe("Its own control at loc:entry-2 shows neither the state the build found it in nor the state this act set, or is no longer shown there, so no press back can be admitted: no call can settle it in this build.");
  });
});

describe("an act's one place (t797 P4 item 1)", () => {
  const original = { resource: "r:library", page: "p:entry-2", place: "pl:reserve-2", before: { "st:free": 1 }, at: "loc:entry-2" };
  const press = { page: "p:entry-2", place: "pl:reserve-9", clock: 1, before: {} };
  it("is its original's place, else its toggle's, else its press's, else its spot's", () => {
    expect(automationStudioSiteResetActOwnControl({ controlOriginal: original, toggle: { page: "p:x", place: "pl:other" }, press, spot: { place: "pl:spot", resource: "r:library" } })).toEqual({ place: "pl:reserve-2", page: "p:entry-2", resource: "r:library", at: "loc:entry-2", found: { "st:free": 1 } });
    expect(automationStudioSiteResetActOwnControl({ toggle: { page: "p:x", place: "pl:toggled" }, press, spot: { place: "pl:spot", resource: "r:library" } })).toEqual({ place: "pl:toggled", page: "p:x", resource: "r:library" });
    expect(automationStudioSiteResetActOwnControl({ press, spot: { place: "pl:spot" } })).toEqual({ place: "pl:reserve-9", page: "p:entry-2" });
    expect(automationStudioSiteResetActOwnControl({ spot: { place: "pl:spot", resource: "r:library" } })).toEqual({ place: "pl:spot", resource: "r:library" });
    expect(automationStudioSiteResetActOwnControl({ spot: {} })).toBeUndefined();
  });
});
