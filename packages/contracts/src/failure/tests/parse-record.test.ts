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

  it("returns null instead of throwing for hostile inputs", () => {
    const hostile = new Proxy({}, { ownKeys: () => { throw new Error("boom"); } });
    expect(parseAutomationStudioFailureRecord(hostile)).toBeNull();
  });
});
