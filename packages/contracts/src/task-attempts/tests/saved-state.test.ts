import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_SAVED_STATES, parseAutomationStudioSavedState } from "../index.ts";

const READY = { state: "ready", trust: "provisional", flowId: "flow-1", savedAtMs: 10, lastWorkedAtMs: 10 };
const PARTLY = { state: "partly_works", trust: "unproven", flowId: "flow-1", savedAtMs: 10, simulation: "passed" };
const NOTES = { state: "notes_only", trust: "unproven", savedAtMs: 10 };
const NEEDS = { state: "needs_you", trust: "unproven", savedAtMs: 10 };

function issuesOf(value: unknown): string[] {
  const result = parseAutomationStudioSavedState(value);
  return result.ok ? [] : result.issues;
}

describe("parseAutomationStudioSavedState", () => {
  it("returns a fresh record for each state", () => {
    expect(AUTOMATION_STUDIO_SAVED_STATES).toEqual(["ready", "partly_works", "notes_only", "needs_you"]);
    for (const saved of [READY, PARTLY, NOTES, NEEDS, { ...NEEDS, flowId: "flow-1", trust: "established" }]) {
      const parsed = parseAutomationStudioSavedState(saved);
      expect(parsed).toEqual({ ok: true, saved });
      expect(parsed.ok && parsed.saved).not.toBe(saved);
    }
  });

  it("carries the digest of saved steps where it names them, and refuses anything else there", () => {
    const stepsDigest = "a".repeat(64);
    expect(parseAutomationStudioSavedState({ ...READY, stepsDigest })).toEqual({ ok: true, saved: { ...READY, stepsDigest } });
    expect(parseAutomationStudioSavedState({ ...PARTLY, stepsDigest })).toEqual({ ok: true, saved: { ...PARTLY, stepsDigest } });
    expect(issuesOf({ ...PARTLY, stepsDigest: "the steps" })).toEqual(["saved_state.invalid_steps_digest"]);
    expect(issuesOf({ ...NOTES, stepsDigest })).toEqual(["saved_state.unknown_key"]);
  });

  it("carries the steps left out of a saved Flow that did something, on a state with steps, and refuses anything else there", () => {
    const leftOut = ["Save: Round pine dining table"];
    expect(parseAutomationStudioSavedState({ ...PARTLY, leftOut })).toEqual({ ok: true, saved: { ...PARTLY, leftOut } });
    expect(parseAutomationStudioSavedState({ ...READY, leftOut })).toEqual({ ok: true, saved: { ...READY, leftOut } });
    expect(parseAutomationStudioSavedState({ ...PARTLY, leftOut: [] })).toEqual({ ok: true, saved: PARTLY });
    for (const bad of ["Save", [""], [1], ["x".repeat(201)], {}]) expect(issuesOf({ ...PARTLY, leftOut: bad })).toEqual(["saved_state.invalid_left_out"]);
    expect(issuesOf({ ...NOTES, leftOut })).toEqual(["saved_state.unknown_key"]);
    expect(issuesOf({ ...NEEDS, leftOut })).toEqual(["saved_state.unknown_key"]);
  });

  // The chip may only claim what is true.
  it("never says ready for what no judged live run proved", () => {
    expect(issuesOf({ ...READY, trust: "unproven" })).toContain("saved_state.ready_needs_proof");
    expect(issuesOf({ ...READY, trust: "established" })).toEqual([]);
    const { lastWorkedAtMs: _lastWorkedAtMs, ...neverWorked } = READY;
    expect(issuesOf(neverWorked)).toEqual(["saved_state.invalid_last_worked_at"]);
    const { flowId: _flowId, ...nothingSaved } = READY;
    expect(issuesOf(nothingSaved)).toEqual(["saved_state.needs_flow"]);
  });

  it("keeps a draft that only passed simulation unproven and short of ready", () => {
    expect(issuesOf(PARTLY)).toEqual([]);
    expect(issuesOf({ ...PARTLY, trust: "provisional" })).toEqual([]);
    expect(issuesOf({ ...PARTLY, trust: "established" })).toEqual(["saved_state.partly_works_not_established"]);
    expect(issuesOf({ ...PARTLY, simulation: "proved" })).toEqual(["saved_state.invalid_simulation"]);
    // Steps that ran and had their stopping step repaired (t878): `true` or absent, and only on partly_works.
    expect(issuesOf({ ...PARTLY, repaired: true })).toEqual([]);
    expect(issuesOf({ ...PARTLY, repaired: false })).toEqual(["saved_state.invalid_repaired"]);
    expect(issuesOf({ ...PARTLY, repaired: "yes" })).toEqual(["saved_state.invalid_repaired"]);
    expect(issuesOf({ ...READY, repaired: true })).toEqual(["saved_state.unknown_key"]);
    const { flowId: _flowId, ...noDraft } = PARTLY;
    expect(issuesOf(noDraft)).toEqual(["saved_state.needs_flow"]);
  });

  it("has no steps and no trust on notes alone", () => {
    expect(issuesOf({ ...NOTES, trust: "provisional" })).toEqual(["saved_state.notes_only_is_unproven"]);
    expect(issuesOf({ ...NOTES, flowId: "flow-1" })).toEqual(["saved_state.unknown_key"]);
  });

  it("refuses an unknown state and an unknown trust, and the fields of another state", () => {
    for (const state of ["saved", "failed", "", null, undefined]) expect(issuesOf({ ...READY, state })).toEqual(["saved_state.invalid_state"]);
    expect(issuesOf({ ...READY, trust: "unverified" })).toEqual(["saved_state.invalid_trust"]);
    expect(issuesOf({ ...NEEDS, lastWorkedAtMs: 1 })).toEqual(["saved_state.unknown_key"]);
    expect(issuesOf({ ...READY, simulation: "passed" })).toEqual(["saved_state.unknown_key"]);
    expect(issuesOf({ ...READY, savedAtMs: "today" })).toEqual(["saved_state.invalid_saved_at"]);
    expect(issuesOf({ ...READY, flowId: "two words" })).toEqual(["saved_state.invalid_flow_id"]);
  });

  it("holds nothing it does not name: no address into a page, page text or token", () => {
    for (const key of ["selector", "pageText", "token", "words"]) {
      expect(issuesOf({ ...NEEDS, [key]: "x" }), key).toEqual(["saved_state.unknown_key"]);
    }
  });

  it("refuses what is not a record, and never throws", () => {
    for (const value of [null, 1, "ready", []]) expect(issuesOf(value)).toEqual(["saved_state.not_object"]);
    const hostile = { ...READY, get state(): string { throw new Error("no"); } };
    expect(issuesOf(hostile)).toEqual(["saved_state.invalid"]);
  });
});
