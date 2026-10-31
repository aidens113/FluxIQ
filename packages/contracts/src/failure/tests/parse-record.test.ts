import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_ADAPTIVE_FAILURE_CLASSES,
  AUTOMATION_STUDIO_FAILURE_RECORD_LIMITS,
  isAutomationStudioAdaptiveFailureClass,
  parseAutomationStudioFailureRecord
} from "../index.ts";

const DIGEST = "a".repeat(64);

describe("Automation Studio failure taxonomy", () => {
  it("keeps one list holding the original nine classes and the seven Week 1 additions", () => {
    expect([...AUTOMATION_STUDIO_ADAPTIVE_FAILURE_CLASSES]).toEqual([
      "action_failed",
      "expected_state_missing",
      "unexpected_state",
      "timeout",
      "blocked_by_capability_or_policy",
      "missing_router_or_subflow_target",
      "graph_validation_or_unknown_node",
      "external_side_effect_denied",
      "ambiguous_or_unknown",
      "target_not_found",
      "target_ambiguous",
      "navigation_unexpected",
      "output_not_observed",
      "page_changed",
      "auth_required",
      "user_intervention_required"
    ]);
    expect(Object.isFrozen(AUTOMATION_STUDIO_ADAPTIVE_FAILURE_CLASSES)).toBe(true);
    expect(isAutomationStudioAdaptiveFailureClass("page_changed")).toBe(true);
    expect(isAutomationStudioAdaptiveFailureClass("PAGE_CHANGED")).toBe(false);
    expect(isAutomationStudioAdaptiveFailureClass(undefined)).toBe(false);
  });
});

describe("parseAutomationStudioFailureRecord", () => {
  it("accepts a minimal record and a complete record, returning fresh objects", () => {
    const minimal = { category: "timeout", code: "web.action.timed_out", retryable: true };
    const parsed = parseAutomationStudioFailureRecord(minimal);
    expect(parsed).toEqual(minimal);
    expect(parsed).not.toBe(minimal);

    expect(parseAutomationStudioFailureRecord({
      category: "target_ambiguous",
      code: "web.target.multiple_matches",
      retryable: true,
      stage: "target_resolution",
      expected: "1 match",
      actual: "3 matches",
      evidenceDigest: DIGEST
    })).toEqual({
      category: "target_ambiguous",
      code: "web.target.multiple_matches",
      retryable: true,
      stage: "target_resolution",
      expected: "1 match",
      actual: "3 matches",
      evidenceDigest: DIGEST
    });
  });

  it("treats explicitly undefined optional fields as absent", () => {
    expect(parseAutomationStudioFailureRecord({ category: "action_failed", code: "x", retryable: false, stage: undefined })).toEqual({ category: "action_failed", code: "x", retryable: false });
  });

  it("rejects unknown fields, wrong types, and non-records", () => {
    const base = { category: "timeout", code: "web.action.timed_out", retryable: true };
    expect(parseAutomationStudioFailureRecord({ ...base, message: "extra" })).toBeNull();
    expect(parseAutomationStudioFailureRecord({ ...base, category: "TIMEOUT" })).toBeNull();
    expect(parseAutomationStudioFailureRecord({ ...base, retryable: "yes" })).toBeNull();
    expect(parseAutomationStudioFailureRecord({ category: "timeout", retryable: true })).toBeNull();
    expect(parseAutomationStudioFailureRecord([base])).toBeNull();
    expect(parseAutomationStudioFailureRecord(null)).toBeNull();
    expect(parseAutomationStudioFailureRecord("timeout")).toBeNull();
    expect(parseAutomationStudioFailureRecord(new (class Failure { category = "timeout"; code = "x"; retryable = true })())).toBeNull();
  });

  it("enforces code, text, stage, and digest bounds", () => {
    const base = { category: "timeout", code: "web.action.timed_out", retryable: true };
    expect(parseAutomationStudioFailureRecord({ ...base, code: "" })).toBeNull();
    expect(parseAutomationStudioFailureRecord({ ...base, code: "has space" })).toBeNull();
    expect(parseAutomationStudioFailureRecord({ ...base, code: "c".repeat(AUTOMATION_STUDIO_FAILURE_RECORD_LIMITS.codeMaxLength + 1) })).toBeNull();
    expect(parseAutomationStudioFailureRecord({ ...base, code: "c".repeat(AUTOMATION_STUDIO_FAILURE_RECORD_LIMITS.codeMaxLength) })).not.toBeNull();
    expect(parseAutomationStudioFailureRecord({ ...base, expected: "" })).toBeNull();
    expect(parseAutomationStudioFailureRecord({ ...base, actual: "x".repeat(AUTOMATION_STUDIO_FAILURE_RECORD_LIMITS.textMaxLength + 1) })).toBeNull();
    expect(parseAutomationStudioFailureRecord({ ...base, stage: "network" })).toBeNull();
    expect(parseAutomationStudioFailureRecord({ ...base, evidenceDigest: DIGEST.toUpperCase() })).toBeNull();
    expect(parseAutomationStudioFailureRecord({ ...base, evidenceDigest: `sha256:${DIGEST}` })).toBeNull();
  });

  it("rejects records whose fields contradict each other", () => {
    for (const category of ["auth_required", "user_intervention_required", "blocked_by_capability_or_policy", "external_side_effect_denied", "graph_validation_or_unknown_node", "missing_router_or_subflow_target"]) {
      expect(parseAutomationStudioFailureRecord({ category, code: "c", retryable: true })).toBeNull();
      expect(parseAutomationStudioFailureRecord({ category, code: "c", retryable: false })).not.toBeNull();
    }
    expect(parseAutomationStudioFailureRecord({ category: "target_not_found", code: "c", retryable: true, stage: "execution" })).toBeNull();
    expect(parseAutomationStudioFailureRecord({ category: "target_ambiguous", code: "c", retryable: true, stage: "dispatch" })).toBeNull();
    expect(parseAutomationStudioFailureRecord({ category: "target_not_found", code: "c", retryable: true })).not.toBeNull();
  });

  it("round-trips a producer's statement that the act did not happen, and the wait it was told to leave", () => {
    // A page that refused a press as "too fast" (`web.action.rate_limited`): the
    // act demonstrably did not happen, and the page said when to try again.
    const refused = { category: "action_failed", code: "web.action.rate_limited", retryable: true, stage: "execution", effect: "unacted", retryAfterMs: 12_500 };
    const parsed = parseAutomationStudioFailureRecord(refused);
    expect(parsed).toEqual(refused);
    expect(parseAutomationStudioFailureRecord(JSON.parse(JSON.stringify(parsed)))).toEqual(refused);
    expect(parseAutomationStudioFailureRecord({ category: "action_failed", code: "c", retryable: true, effect: "ambiguous" })).toEqual({ category: "action_failed", code: "c", retryable: true, effect: "ambiguous" });
    expect(parseAutomationStudioFailureRecord({ category: "timeout", code: "c", retryable: true, retryAfterMs: 0 })).not.toBeNull();
    expect(parseAutomationStudioFailureRecord({ category: "timeout", code: "c", retryable: true, retryAfterMs: AUTOMATION_STUDIO_FAILURE_RECORD_LIMITS.retryAfterMsMax })).not.toBeNull();
  });

  it("rejects an unknown effect, an unreadable wait, and a wait on a record that says retrying cannot help", () => {
    const base = { category: "action_failed", code: "web.action.rate_limited", retryable: true };
    expect(parseAutomationStudioFailureRecord({ ...base, effect: "none" })).toBeNull();
    expect(parseAutomationStudioFailureRecord({ ...base, effect: "UNACTED" })).toBeNull();
    for (const retryAfterMs of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "12000", AUTOMATION_STUDIO_FAILURE_RECORD_LIMITS.retryAfterMsMax + 1]) {
      expect(parseAutomationStudioFailureRecord({ ...base, retryAfterMs })).toBeNull();
    }
    expect(parseAutomationStudioFailureRecord({ ...base, retryable: false, retryAfterMs: 1_000 })).toBeNull();
  });

  it("round-trips a press the producer saw certainly change nothing, only beside a retryable unacted statement", () => {
    // A press after which, once the page settled, nothing on it had changed and
    // the control was still there to press (t517).
    const ignored = { category: "action_failed", code: "web.action.no_effect", retryable: true, stage: "execution", effect: "unacted", certainNoEffect: true };
    expect(parseAutomationStudioFailureRecord(ignored)).toEqual(ignored);
    expect(parseAutomationStudioFailureRecord(JSON.parse(JSON.stringify(ignored)))).toEqual(ignored);
    // Certainty about the act is a statement that it did not happen, which a retry must be able to act on.
    expect(parseAutomationStudioFailureRecord({ ...ignored, certainNoEffect: false })).toBeNull();
    expect(parseAutomationStudioFailureRecord({ ...ignored, certainNoEffect: "true" })).toBeNull();
    expect(parseAutomationStudioFailureRecord({ ...ignored, effect: "ambiguous" })).toBeNull();
    const { effect: _effect, ...unstated } = ignored;
    expect(parseAutomationStudioFailureRecord(unstated)).toBeNull();
    expect(parseAutomationStudioFailureRecord({ ...ignored, retryable: false })).toBeNull();
  });

  it("returns null instead of throwing for hostile inputs", () => {
    const hostile = new Proxy({}, { ownKeys: () => { throw new Error("boom"); } });
    expect(parseAutomationStudioFailureRecord(hostile)).toBeNull();
  });

  it("round-trips a strictly true transient claim independently of retry permission and effect", () => {
    for (const retryable of [true, false]) {
      for (const effect of ["unacted", "ambiguous"] as const) {
        const record = { category: "action_failed", code: "example.temporarily_busy", retryable, stage: "execution", effect, transient: true };
        expect(parseAutomationStudioFailureRecord(record)).toEqual(record);
        expect(parseAutomationStudioFailureRecord(JSON.parse(JSON.stringify(record)))).toEqual(record);
      }
    }
    expect(parseAutomationStudioFailureRecord({ category: "timeout", code: "example.wait", retryable: false, transient: true })).toEqual({ category: "timeout", code: "example.wait", retryable: false, transient: true });
    expect(parseAutomationStudioFailureRecord({ category: "timeout", code: "example.wait", retryable: true, transient: undefined })).toEqual({ category: "timeout", code: "example.wait", retryable: true });
  });

  it("rejects false, null, unknown and contradictory transient claims", () => {
    const base = { category: "timeout", code: "example.wait", retryable: true };
    for (const transient of [false, null, "true", 1, {}, []]) {
      expect(parseAutomationStudioFailureRecord({ ...base, transient })).toBeNull();
    }
    for (const category of ["auth_required", "user_intervention_required", "blocked_by_capability_or_policy", "external_side_effect_denied", "graph_validation_or_unknown_node", "missing_router_or_subflow_target"]) {
      expect(parseAutomationStudioFailureRecord({ category, code: "example.refused", retryable: false, transient: true })).toBeNull();
      expect(parseAutomationStudioFailureRecord({ category, code: "example.refused", retryable: false })).not.toBeNull();
    }
    expect(parseAutomationStudioFailureRecord({ ...base, transient: true, temporary: true })).toBeNull();
    expect(parseAutomationStudioFailureRecord({ ...base, category: "unknown_category", transient: true })).toBeNull();
  });
});
