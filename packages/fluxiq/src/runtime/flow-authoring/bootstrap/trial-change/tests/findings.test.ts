import { describe, expect, it } from "vitest";
import { automationStudioTrialChangeFindings as findings, automationStudioTrialDelta as delta, type AutomationStudioTrialWitness } from "../index.ts";

// Core's closed findings over a trial's change: a change part no witness
// showed, and a change where no act of the trial was attributed. Both are
// judged relative to the before-state, whatever the absolute state was.

const pinned: AutomationStudioTrialWitness = { id: "w3", kind: "list", group: "g:posts", where: "the pinned posts", steps: [], parts: [] };
const posts = (state: string) => ({ source: "core_look" as const, collections: [{ scope: "sc:feed", group: "g:posts", subjects: ["s:pinned"], states: { "s:pinned": state } }] });
const like: AutomationStudioTrialWitness = { id: "w4", kind: "control", place: "pl:like", steps: [5], parts: ["p1"] };
const likeAt = (on: number) => ({ source: "core_look" as const, controls: { "pl:like": { "st:on": on, "st:off": 1 - on } } });

describe("an unchanged-watch witness", () => {
  it("raises nothing when it was already in the wrong state before and is the same after", () => {
    const deltas = [delta(pinned, posts("st:liked"), posts("st:liked"))];
    expect(findings({ witnesses: [pinned], deltas, acts: [], proofs: [] })).toEqual([]);
  });

  it("raises result.unasked_change when it changed", () => {
    const deltas = [delta(pinned, posts("st:plain"), posts("st:liked"))];
    expect(findings({ witnesses: [pinned], deltas, acts: [], proofs: [] })).toEqual([{ code: "result.unasked_change", witness: "w3", where: "the pinned posts" }]);
  });

  it("raises nothing when it was unread", () => {
    expect(findings({ witnesses: [pinned], deltas: [delta(pinned, posts("st:plain"), undefined)], acts: [], proofs: [] })).toEqual([]);
  });
});

describe("a control place", () => {
  it("raises result.unasked_change when it changed with no act there, nothing when an act was", () => {
    const deltas = [delta(like, likeAt(0), likeAt(1))];
    expect(findings({ witnesses: [like], deltas, acts: [{ step: 5, outcome: "changed", witness: "w4", parts: ["p1"] }], proofs: [] })).toEqual([]);
    expect(findings({ witnesses: [like], deltas, acts: [{ step: 5, outcome: "changed", parts: ["p1"] }], proofs: [] })).toEqual([]);
    expect(findings({ witnesses: [like], deltas, acts: [{ step: 7, outcome: "changed", witness: "w9", parts: [] }], proofs: [] })).toEqual([{ code: "result.unasked_change", witness: "w4" }]);
  });
});

describe("a change part no witness showed", () => {
  it("raises result.change_not_seen, and nothing for any other proof", () => {
    const effect = { kind: "change" as const, direction: "adds" as const, count: 1, what: "a hold" };
    expect(findings({ witnesses: [], deltas: [], acts: [], proofs: [{ part: "p1", effect, proof: "no_change", steps: [] }, { part: "p2", effect, proof: "unproven", steps: [] }, { part: "p3", effect, proof: "shown", steps: [] }] })).toEqual([{ code: "result.change_not_seen", part: "p1" }]);
  });
});
