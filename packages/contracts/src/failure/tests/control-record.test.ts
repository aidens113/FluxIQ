import { describe, expect, it } from "vitest";
import { parseAutomationStudioFailureRecord, projectAutomationStudioFailureControlRecord } from "../../automation-studio.ts";

const comparison = { expected: "PRIVATE_EXPECTED_MARKER", actual: "PRIVATE_ACTUAL_MARKER", evidenceDigest: "a".repeat(64) };

describe("the public control-only failure projection", () => {
  it("keeps every present control field, strips comparison evidence and never mutates its input", () => {
    const original = Object.freeze({
      category: "action_failed",
      code: "example.rate_limited",
      retryable: true,
      stage: "execution",
      effect: "unacted",
      retryAfterMs: 0,
      certainNoEffect: true,
      transient: true,
      ...comparison
    });
    const snapshot = structuredClone(original);
    const control = projectAutomationStudioFailureControlRecord(original);
    expect(control).toEqual({ category: "action_failed", code: "example.rate_limited", retryable: true, stage: "execution", effect: "unacted", retryAfterMs: 0, certainNoEffect: true, transient: true });
    expect(control).not.toBe(original);
    expect(projectAutomationStudioFailureControlRecord(original)).not.toBe(control);
    expect(original).toEqual(snapshot);
    expect(parseAutomationStudioFailureRecord(original)).toEqual(snapshot);
    expect(JSON.stringify(control)).not.toContain(comparison.expected);
    expect(JSON.stringify(control)).not.toContain(comparison.actual);
    expect(JSON.stringify(control)).not.toContain(comparison.evidenceDigest);
    expect(parseAutomationStudioFailureRecord(JSON.parse(JSON.stringify(control)))).toEqual(control);
  });

  it("retains complete and minimal legacy records without inventing transient, certainty or effect", () => {
    const minimal = { category: "timeout", code: "example.wait", retryable: false };
    expect(projectAutomationStudioFailureControlRecord(minimal)).toEqual(minimal);
    expect(projectAutomationStudioFailureControlRecord(minimal)).not.toBe(minimal);
    const complete = { ...minimal, stage: "dispatch", effect: "ambiguous", ...comparison };
    expect(projectAutomationStudioFailureControlRecord(complete)).toEqual({ ...minimal, stage: "dispatch", effect: "ambiguous" });
    expect(parseAutomationStudioFailureRecord(complete)).toEqual(complete);
    expect(projectAutomationStudioFailureControlRecord({ ...minimal, transient: true })).toEqual({ ...minimal, transient: true });
  });

  it("validates the whole input before stripping comparisons and rejects malformed or contradictory metadata", () => {
    const base = { category: "timeout", code: "example.wait", retryable: true };
    const invalid: unknown[] = [
      null,
      false,
      [],
      {},
      { ...base, expected: 1 },
      { ...base, actual: "" },
      { ...base, evidenceDigest: "invalid" },
      { ...base, message: "PRIVATE_MESSAGE_MARKER" },
      { ...base, transient: false },
      { ...base, transient: null },
      { ...base, transient: true, category: "auth_required", retryable: false },
      { ...base, retryable: false, retryAfterMs: 1 },
      { ...base, effect: "ambiguous", certainNoEffect: true }
    ];
    for (const value of invalid) expect(projectAutomationStudioFailureControlRecord(value)).toBeUndefined();
    const hostile = new Proxy({}, { ownKeys: () => { throw new Error("Unreadable metadata."); } });
    expect(projectAutomationStudioFailureControlRecord(hostile)).toBeUndefined();
  });
});
