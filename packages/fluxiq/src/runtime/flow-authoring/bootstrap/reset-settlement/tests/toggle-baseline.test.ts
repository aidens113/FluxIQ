import { describe, expect, it } from "vitest";
import {
  AutomationStudioSiteResetControlTracker,
  AutomationStudioSiteResetObservations,
  AutomationStudioSiteResetReach,
  AutomationStudioSiteResetSettlementJudge,
  type AutomationStudioSiteResetJudgedAct
} from "../index.ts";

// t751 R1 and R2 for stateful controls (office `run-mvhibit5-e1d3a4f3` cause 1,
// photo `run-mvhibis0-b536958b` "the reset left a like"): a toggle settles on a
// fresh read of its place at the build's start counts, whatever put it back,
// and a place whose start was never read before the build acted there has no
// toggle witness that can hold. Generic fixtures: a library form, a gallery.

const OPT_IN = { from: "st:on", to: "st:off" };

function judged() {
  const seen = new AutomationStudioSiteResetObservations();
  const tracker = new AutomationStudioSiteResetControlTracker();
  const acts: AutomationStudioSiteResetJudgedAct[] = [];
  const state = { clock: 0 };
  // The ledger's receipts object, refs closed: nothing here may depend on it.
  const receipts = { named: () => undefined, described: () => undefined, issuedRefs: () => [], refsClosed: () => true };
  const judge = new AutomationStudioSiteResetSettlementJudge({ seen, tracker, reach: new AutomationStudioSiteResetReach(), receipts, acts: () => acts, clock: () => state.clock, explored: () => [] });
  return { seen, tracker, acts, state, judge };
}

describe("a toggle settled by observed state (R2)", () => {
  it("office shape: unticked, later read at the start counts with no press back, is settled restored", () => {
    const { tracker, acts, state, judge } = judged();
    tracker.read({ scope: "p:loan-form", location: "loc:loan-form", controls: { "pl:reminder": { "st:on": 1 } } }, 0);
    state.clock = 1;
    const press = tracker.press("pl:reminder", 1);
    const act: AutomationStudioSiteResetJudgedAct = { id: "act-1", call: "call-1", spot: { page: "pg:loan-form", state: "st:on" }, destinations: [], repeats: [], clock: 1, press, changeSeen: false, attempts: 0 };
    acts.push(act);
    tracker.read({ scope: "p:loan-form", location: "loc:loan-form", controls: { "pl:reminder": { "st:off": 1 } } }, 1);
    expect(judge.evaluate(act)).toEqual({ kind: "open", reasons: [{ reason: "toggle", witness: "toggle", location: "loc:loan-form" }] });
    // A later lasting call: nothing read since, so the control's state is to be read again, never pressed blind.
    state.clock = 2;
    expect(judge.evaluate(act)).toEqual({ kind: "open", reasons: [{ reason: "look", witness: "toggle", location: "loc:loan-form" }] });
    // A fresh session of the form shows the control at the build's start by itself: settled, with no press back.
    tracker.read({ scope: "p:loan-form-2", location: "loc:loan-form-2", controls: { "pl:reminder": { "st:on": 1 } } }, 2);
    expect(judge.evaluate(act)).toEqual({ kind: "settled", how: "restored" });
  });

  it("holds on any fresh read reporting the place at its start, and opens again when the latest read shows it changed", () => {
    const tracker = new AutomationStudioSiteResetControlTracker();
    tracker.read({ scope: "p:loan-form", location: "loc:loan-form", controls: { "pl:reminder": { "st:on": 1 } } }, 0);
    tracker.press("pl:reminder", 1);
    tracker.read({ scope: "p:loan-form", location: "loc:loan-form", controls: { "pl:reminder": { "st:off": 1 } } }, 1);
    tracker.read({ scope: "p:loan-form", location: "loc:loan-form", controls: { "pl:reminder": { "st:on": 1 } } }, 1);
    expect(tracker.standing("pl:reminder", OPT_IN, 1, 1)).toEqual({ status: "holds", location: "loc:loan-form" });
    tracker.read({ scope: "p:account", location: "loc:account", controls: { "pl:reminder": { "st:off": 1 } } }, 1);
    expect(tracker.standing("pl:reminder", OPT_IN, 1, 1)).toEqual({ status: "open", location: "loc:account" });
    // A read of the press's page that no longer reports the place, latest of all: empty there, open.
    tracker.read({ scope: "p:loan-form", location: "loc:loan-form", controls: { "pl:reminder": { "st:on": 1 } } }, 2);
    tracker.read({ scope: "p:loan-form", location: "loc:loan-form", controls: {} }, 2);
    expect(tracker.standing("pl:reminder", OPT_IN, 1, 2)).toEqual({ status: "open", location: "loc:loan-form" });
  });
});

describe("a control's start read before the build acted there (R1)", () => {
  it("photo shape: a place first pressed by a trial step with no place reported has no start a later trial step's before can seed", () => {
    const { tracker, acts, state, judge } = judged();
    // Trial 1 pressed the place in a view whose step reported no controls: the place has a press, and no start.
    state.clock = 1;
    tracker.touched("pl:fave-1");
    // Trial 2's step at that place found it in the state trial 1 left and pressed it back.
    state.clock = 2;
    const press = tracker.landed("p:picture-1", "pl:fave-1", { "st:faved": 1 }, { "st:fave": 1 }, 2, "loc:picture-1");
    const act: AutomationStudioSiteResetJudgedAct = { id: "act-2", spot: { page: "pg:picture-1", state: "st:faved" }, destinations: [], repeats: [], clock: 2, press, changeSeen: false, attempts: 0 };
    acts.push(act);
    const unproven = { kind: "open", reasons: [{ reason: "baseline", witness: "toggle", location: "loc:picture-1" }] };
    expect(judge.evaluate(act)).toEqual(unproven);
    expect(judge.unmet(act)).toBe("no_baseline");
    // Pressing it back to the state trial 2 found is never answered as settling it.
    state.clock = 3;
    tracker.read({ scope: "p:picture-1", location: "loc:picture-1", controls: { "pl:fave-1": { "st:fave": 1 } } }, 3);
    state.clock = 4;
    tracker.press("pl:fave-1", 4);
    tracker.read({ scope: "p:picture-1", location: "loc:picture-1", controls: { "pl:fave-1": { "st:faved": 1 } } }, 4);
    expect(judge.evaluate(act)).toEqual(unproven);
    expect(judge.settle(act)).not.toMatch(/press that same control back/u);
  });

  it("a read after the build's own press at a place never seen before is no start for it", () => {
    const tracker = new AutomationStudioSiteResetControlTracker();
    tracker.read({ scope: "p:shelf", location: "loc:shelf" }, 0);
    tracker.press("pl:hold", 1);
    tracker.read({ scope: "p:shelf", location: "loc:shelf", controls: { "pl:hold": { "st:held": 1 } } }, 1);
    expect(tracker.standing("pl:hold", { from: "st:hold", to: "st:held" }, 1, 1)).toEqual({ status: "unproven", location: "loc:shelf" });
  });

  it("a trial step's before seeds a place no press and no read ever reported, and a fresh read at it then holds", () => {
    const tracker = new AutomationStudioSiteResetControlTracker();
    tracker.landed("p:picture-2", "pl:fave-2", { "st:fave": 1 }, { "st:faved": 1 }, 1, "loc:picture-2");
    const FAVE = { from: "st:fave", to: "st:faved" };
    // The step's page has not been read since: stale, look there.
    expect(tracker.standing("pl:fave-2", FAVE, 1, 1)).toEqual({ status: "stale", location: "loc:picture-2" });
    tracker.read({ scope: "p:picture-2", location: "loc:picture-2", controls: { "pl:fave-2": { "st:fave": 1 } } }, 1);
    expect(tracker.standing("pl:fave-2", FAVE, 1, 1)).toEqual({ status: "holds", location: "loc:picture-2" });
    // A second trial step at the same place never re-seeds it.
    tracker.landed("p:picture-2", "pl:fave-2", { "st:faved": 1 }, { "st:fave": 1 }, 2);
    tracker.read({ scope: "p:picture-2", location: "loc:picture-2", controls: { "pl:fave-2": { "st:fave": 1 } } }, 2);
    expect(tracker.standing("pl:fave-2", { from: "st:faved", to: "st:fave" }, 2, 2)).toMatchObject({ status: "holds" });
  });
});
