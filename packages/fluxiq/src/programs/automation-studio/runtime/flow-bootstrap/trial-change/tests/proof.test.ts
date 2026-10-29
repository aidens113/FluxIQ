import { describe, expect, it } from "vitest";
import { automationStudioTrialDelta as delta, automationStudioTrialPartProof as proof, type AutomationStudioTrialActOutcome, type AutomationStudioTrialDelta, type AutomationStudioTrialNotRun, type AutomationStudioTrialWitness } from "../index.ts";

// What a trial proves of one task part, from the part's typed effect and the
// deltas of its witnesses: judged against the before-state, never an absolute.

const cart: AutomationStudioTrialWitness = { id: "w1", kind: "list", group: "g:cart", steps: [2], parts: ["p1"] };
const lineAt = (state: string) => ({ source: "core_look" as const, collections: [{ scope: "sc:cart", group: "g:cart", subjects: ["s:a"], states: { "s:a": state } }] });
const addOne = { id: "p1", effect: { kind: "change" as const, direction: "adds" as const, count: 1, what: "one more of the item" } };
const alert = { id: "p2", effect: { kind: "end_state" as const, state: "the alert is set to email" } };
const acts: AutomationStudioTrialActOutcome[] = [{ step: 2, outcome: "changed", witness: "w1", parts: ["p1"] }];
const unchanged: AutomationStudioTrialDelta = { witness: "w9", kind: "control", status: "unchanged", before: { "st:on": 1 }, after: { "st:on": 1 } };
const unread: AutomationStudioTrialDelta = { witness: "w8", kind: "list", status: "unread" };

describe("a change part's proof", () => {
  it("is shown when its list line went from 9 (left by an earlier act) to 10, with no reset", () => {
    const deltas = [delta(cart, lineAt("st:9"), lineAt("st:10"))];
    expect(deltas[0]).toMatchObject({ status: "changed", changed: ["s:a"] });
    expect(proof({ part: addOne, deltas, acts, carried: false })).toEqual({ part: "p1", effect: addOne.effect, proof: "shown", steps: [2] });
  });

  it("is no_change when every witness was read and none changed, unproven while any is unread", () => {
    expect(proof({ part: addOne, deltas: [unchanged], acts, carried: false }).proof).toBe("no_change");
    expect(proof({ part: addOne, deltas: [unread], acts, carried: false }).proof).toBe("unproven");
    expect(proof({ part: addOne, deltas: [], acts, carried: false }).proof).toBe("unproven");
    expect(proof({ part: addOne, deltas: [unchanged, unread], acts, carried: false }).proof).toBe("unproven");
  });

  it("is none when the part has no typed effect", () => {
    expect(proof({ part: { id: "p3" }, deltas: [delta(cart, lineAt("st:9"), lineAt("st:10"))], acts: [], carried: false })).toEqual({ part: "p3", proof: "none", steps: [] });
  });
});

describe("a change part's proof has a direction (t787 fix 4)", () => {
  // A shelf of books, each with a "keep" toggle: the build found every book unkept (`st:off`).
  const keep = (id: string): AutomationStudioTrialWitness => ({ id, kind: "control", place: `pl:${id}`, steps: [3], parts: ["p1"] });
  const at = (id: string, state: string) => ({ source: "step_diff" as const, controls: { [`pl:${id}`]: { [state]: 1, "st:other": 1 } } });
  const start = { "st:off": 1, "st:other": 1 };
  const keepThree = { id: "p1", effect: { kind: "change" as const, direction: "adds" as const, count: 3, what: "kept books" } };

  it("reads a control that went back to the build's start as returned, one that moved away from it as not", () => {
    expect(delta(keep("w1"), at("w1", "st:on"), at("w1", "st:off"), start)).toMatchObject({ status: "changed", returned: true });
    expect(delta(keep("w1"), at("w1", "st:off"), at("w1", "st:on"), start)).not.toHaveProperty("returned");
    // With no start recorded, nothing is said of its direction.
    expect(delta(keep("w1"), at("w1", "st:on"), at("w1", "st:off"))).not.toHaveProperty("returned");
  });

  it("is contradicted, not shown, when one of an adds part's witnesses went back to the build's start", () => {
    const deltas = [delta(keep("w1"), at("w1", "st:off"), at("w1", "st:on"), start), delta(keep("w2"), at("w2", "st:on"), at("w2", "st:off"), start), delta(keep("w3"), at("w3", "st:off"), at("w3", "st:on"), start)];
    expect(proof({ part: keepThree, deltas, acts, carried: false })).toEqual({ part: "p1", effect: keepThree.effect, proof: "contradicted", steps: [2] });
  });

  it("stays shown when every witness of an adds part moved away from the build's start", () => {
    const deltas = [delta(keep("w1"), at("w1", "st:off"), at("w1", "st:on"), start), delta(keep("w2"), at("w2", "st:off"), at("w2", "st:on"), start), delta(cart, lineAt("st:9"), lineAt("st:10"))];
    expect(proof({ part: keepThree, deltas, acts, carried: false }).proof).toBe("shown");
  });

  it("leaves a removes part's return to the start shown: going back is what it asks", () => {
    const unkeep = { id: "p1", effect: { kind: "change" as const, direction: "removes" as const, count: 1, what: "kept books" } };
    expect(proof({ part: unkeep, deltas: [delta(keep("w1"), at("w1", "st:on"), at("w1", "st:off"), start)], acts, carried: false }).proof).toBe("shown");
  });
});

describe("an end-state part's proof", () => {
  it("is already_in_end_state when before equals after and the step was never seen making it, carried when it was", () => {
    expect(proof({ part: alert, deltas: [unchanged], acts: [], carried: false }).proof).toBe("already_in_end_state");
    expect(proof({ part: alert, deltas: [unchanged], acts: [], carried: true }).proof).toBe("carried");
  });

  it("is unproven when its only witnesses are lists that read the same: a list an act could reach says nothing of the state asked", () => {
    const sameList: AutomationStudioTrialDelta = { witness: "w1", kind: "list", status: "unchanged", added: [], removed: [], changed: [], unchanged: ["s:a"] };
    expect(proof({ part: alert, deltas: [sameList], acts: [], carried: false }).proof).toBe("unproven");
    expect(proof({ part: alert, deltas: [sameList, unchanged], acts: [], carried: false }).proof).toBe("already_in_end_state");
  });

  it("is shown when a witness changed, unproven when no witness was read", () => {
    const changed: AutomationStudioTrialDelta = { witness: "w9", kind: "control", status: "changed", before: { "st:off": 1 }, after: { "st:on": 1 } };
    expect(proof({ part: alert, deltas: [changed], acts: [], carried: false }).proof).toBe("shown");
    expect(proof({ part: alert, deltas: [unread], acts: [], carried: true }).proof).toBe("unproven");
  });
});

// Debug `run-mvtdn37t-e1e4d0a7` (t796): a guard went past the act step on every pass, and the proof said `no_change`
// with `steps: []`, so the judge and the builder read "the act did not register" instead of "the act step never ran".
describe("a part whose acting steps were not run (t796)", () => {
  const holdEach = { id: "p1", effect: { kind: "change" as const, direction: "adds" as const, count: "each_match" as const, what: "a hold on each book" } };
  const guarded = (passes: number[]): AutomationStudioTrialNotRun => ({ nodeId: "hold", label: "place a hold", reason: "guarded", after: "close the library banner", passes, of: 3 });

  it("a part whose act step never ran is `not_run`, naming the step", () => {
    expect(proof({ part: holdEach, deltas: [unchanged], acts: [], carried: false, acting: [{ notRun: [guarded([1, 2, 3])] }] })).toEqual({
      part: "p1", effect: holdEach.effect, proof: "not_run", steps: [], notRun: [guarded([1, 2, 3])]
    });
  });

  it("is not_run first, before contradicted or shown, and when every pass is covered by its reasons together", () => {
    const returned: AutomationStudioTrialDelta = { witness: "w9", kind: "control", status: "changed", before: { "st:on": 1 }, after: { "st:off": 1 }, returned: true };
    const unreached: AutomationStudioTrialNotRun = { nodeId: "hold", label: "place a hold", reason: "unreached", passes: [3], of: 3 };
    expect(proof({ part: holdEach, deltas: [returned], acts, carried: false, acting: [{ notRun: [guarded([1, 2]), unreached] }] }).proof).toBe("not_run");
    // Outside a repeat, an entry alone says the step never ran.
    expect(proof({ part: holdEach, deltas: [], acts: [], carried: false, acting: [{ notRun: [{ nodeId: "renew", label: "renew", reason: "unreached", passes: [1] }] }] }).proof).toBe("not_run");
  });

  it("keeps the proof it reads, with notRun beside it, when the act step ran on some passes or another acting step ran", () => {
    const changed: AutomationStudioTrialDelta = { witness: "w9", kind: "control", status: "changed", before: { "st:off": 1 }, after: { "st:on": 1 } };
    expect(proof({ part: holdEach, deltas: [changed], acts, carried: false, acting: [{ notRun: [guarded([1, 3])] }] })).toMatchObject({ proof: "shown", notRun: [guarded([1, 3])] });
    expect(proof({ part: holdEach, deltas: [unchanged], acts, carried: false, acting: [{ notRun: [guarded([1, 2, 3])] }, { notRun: [] }] })).toMatchObject({ proof: "no_change", notRun: [guarded([1, 2, 3])] });
    // A part with no acting step, or none not run, reads as before.
    expect(proof({ part: holdEach, deltas: [unchanged], acts, carried: false, acting: [] })).toEqual({ part: "p1", effect: holdEach.effect, proof: "no_change", steps: [2] });
  });
});
