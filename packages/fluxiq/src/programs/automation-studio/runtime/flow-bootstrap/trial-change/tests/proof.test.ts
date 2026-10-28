import { describe, expect, it } from "vitest";
import { automationStudioTrialDelta as delta, automationStudioTrialPartProof as proof, type AutomationStudioTrialActOutcome, type AutomationStudioTrialDelta, type AutomationStudioTrialWitness } from "../index.ts";

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
