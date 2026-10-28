import { describe, expect, it } from "vitest";
import {
  AutomationStudioSiteResetControlTracker,
  AutomationStudioSiteResetObservations,
  AutomationStudioSiteResetReach,
  AutomationStudioSiteResetSettlementJudge,
  AutomationStudioSiteResetValueTracker,
  automationStudioSiteResetSettleWords as settleWords,
  automationStudioSiteResetValuesOf as valuesOf,
  automationStudioSiteResetValueWitnessOf as valueWitnessOf,
  type AutomationStudioSiteResetJudgedAct
} from "../index.ts";

// t772 value witness, judged (rerun round 6 cause 1, generic shape): a value act settles when a fresh read after the
// latest lasting call shows the build's start value at its place; it is looked at while stale, never meetable while its
// place's start was never read, and closed once two landed undos each read fresh still do not bring the value back.
// Made-up fixture: an app's preferences page and the theme it shows. Opaque tokens only.

const PAGE = "p:prefs", AT = "loc:prefs";
const WITNESS = { page: PAGE, location: AT, replaced: [{ place: "pl:theme", from: "v:light", to: "v:dark" }] };

function judged() {
  const values = new AutomationStudioSiteResetValueTracker();
  const acts: AutomationStudioSiteResetJudgedAct[] = [];
  const state = { clock: 0 };
  const receipts = { named: () => undefined, described: () => undefined, issuedRefs: () => [] };
  const judge = new AutomationStudioSiteResetSettlementJudge({ seen: new AutomationStudioSiteResetObservations(), tracker: new AutomationStudioSiteResetControlTracker(), values, reach: new AutomationStudioSiteResetReach(), receipts, acts: () => acts, clock: () => state.clock, explored: () => [] });
  const read = (theme: string) => judge.read({ scope: PAGE, location: AT, values: { "pl:theme": theme } });
  return { values, acts, state, judge, read };
}

/** An act read around by Core: the start read before it, the act at clock 1, the read after it. */
function explored() {
  const setUp = judged();
  setUp.read("v:light");
  setUp.state.clock = 1;
  const act: AutomationStudioSiteResetJudgedAct = { id: "act-1", spot: { resource: "r:app", scope: PAGE, state: "st:save" }, destinations: [], repeats: [], clock: 1, changeSeen: false, attempts: 0 };
  setUp.acts.push(act);
  setUp.read("v:dark");
  setUp.judge.valued(act, WITNESS, "read");
  return { ...setUp, act };
}

describe("a value act judged by its shown value (t772)", () => {
  it("is open while the set value shows, looked at once stale, and restored when a fresh read shows the start value", () => {
    const { state, judge, read, act } = explored();
    expect(act.value).toEqual(WITNESS);
    expect(judge.evaluate(act)).toEqual({ kind: "open", reasons: [{ reason: "value", witness: "value", location: AT }] });
    // Its own control pressed under `undoes`: the clock moved, the read before it is stale.
    act.attempts = 1;
    state.clock = 2;
    expect(judge.evaluate(act)).toEqual({ kind: "open", reasons: [{ reason: "look", witness: "value", location: AT }] });
    read("v:light");
    expect(judge.evaluate(act)).toEqual({ kind: "settled", how: "restored" });
  });

  it("is never meetable when its place's start was never read: no_baseline", () => {
    const { acts, state, judge, read } = judged();
    state.clock = 1;
    const act: AutomationStudioSiteResetJudgedAct = { id: "act-1", destinations: [], repeats: [], clock: 1, changeSeen: false, attempts: 0 };
    acts.push(act);
    judge.valued(act, WITNESS, "read");
    read("v:dark");
    expect(judge.evaluate(act)).toEqual({ kind: "open", reasons: [{ reason: "baseline", witness: "value", location: AT }] });
    expect(judge.unmet(act, () => undefined)).toBe("no_baseline");
    expect(judge.settle(act)).toContain("no call can settle it in this build");
  });

  it("hands an open value to the ledger's own rule (an own control with no tokens is no_admissible_undo), and closes it after two landed undos read fresh", () => {
    const { state, judge, read, act } = explored();
    expect(judge.unmet(act, (reason) => (reason.reason === "value" ? "no_admissible_undo" : undefined))).toBe("no_admissible_undo");
    expect(judge.unmet(act, () => undefined)).toBeUndefined();
    act.attempts = 1;
    state.clock = 2;
    read("v:dark");
    expect(judge.unmet(act, () => undefined)).toBeUndefined();
    act.attempts = 2;
    state.clock = 3;
    // The second undo not read yet: one miss only.
    expect(judge.unmet(act, () => undefined)).toBeUndefined();
    read("v:dark");
    expect(judge.unmet(act, () => undefined)).toBe("value_not_back");
  });

  it("is not a value act while another witness judges it", () => {
    const { judge, read, state, acts } = judged();
    read("v:light");
    state.clock = 1;
    const act: AutomationStudioSiteResetJudgedAct = { id: "act-1", destinations: [], repeats: [], clock: 1, changeSeen: false, attempts: 0, toggle: { page: PAGE, place: "pl:mute", from: "st:off", to: "st:on" } };
    acts.push(act);
    read("v:dark");
    judge.valued(act, WITNESS, "read");
    expect(act.value).toBeUndefined();
  });

  it("says each value reason in generic words naming no site", () => {
    const words = [
      settleWords([{ reason: "value", witness: "value", location: AT }], []),
      settleWords([{ reason: "look", witness: "value", location: AT }], []),
      settleWords([{ reason: "baseline", witness: "value", location: AT }], [])
    ];
    expect(words[0]).toContain("set it back where it shows");
    expect(words[0]).toContain("then look at the page");
    expect(words[1]).toContain("so the value this act set can be seen");
    expect(words[2]).toContain("was never read before the build changed it");
    for (const said of words) expect(said).not.toMatch(/resetDestination|store|address|checkout|deliver|cart|basket/iu);
  });
});

describe("the domain's value tokens, parsed (t772)", () => {
  it("keeps a read's values only when every place and value is an opaque token", () => {
    expect(valuesOf({ "pl:theme": "v:light", "pl:size": "v:large" })).toEqual({ "pl:theme": "v:light", "pl:size": "v:large" });
    expect(valuesOf({ "pl:theme": "v:light", "pl theme": "v:large" })).toBeUndefined();
    expect(valuesOf({ "pl:theme": 3 })).toBeUndefined();
    expect(valuesOf(["pl:theme"])).toBeUndefined();
    expect(valuesOf(Object.fromEntries(Array.from({ length: 2_001 }, (_, index) => [`pl:${index}`, "v:x"])))).toBeUndefined();
  });

  it("keeps a step diff's replaced values, with the page's location where one is given, and drops a malformed one whole", () => {
    const diff = { page: PAGE, location: "ignored", replaced: [{ place: "pl:theme", from: "v:light", to: "v:dark", newValue: true }] };
    expect(valueWitnessOf(diff, AT)).toEqual({ page: PAGE, location: AT, replaced: [{ place: "pl:theme", from: "v:light", to: "v:dark", newValue: true }] });
    expect(valueWitnessOf({ ...diff, replaced: [{ place: "pl:theme", from: "v:light", to: "v:dark", newValue: false }] })).toEqual({ page: PAGE, replaced: [{ place: "pl:theme", from: "v:light", to: "v:dark" }] });
    expect(valueWitnessOf({ ...diff, replaced: [{ place: "pl:theme", from: "v:light" }] })).toBeUndefined();
    expect(valueWitnessOf({ ...diff, replaced: [] })).toBeUndefined();
    expect(valueWitnessOf({ ...diff, page: "p page" })).toBeUndefined();
    expect(valueWitnessOf({ ...diff, replaced: Array.from({ length: 257 }, (_, index) => ({ place: `pl:${index}`, from: "v:a", to: "v:b" })) })).toBeUndefined();
  });
});
