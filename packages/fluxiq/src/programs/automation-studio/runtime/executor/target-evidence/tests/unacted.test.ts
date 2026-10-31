import { describe, expect, it } from "vitest";
import type { AutomationStudioNodeAttemptTrace } from "../../contracts.ts";
import { automationStudioTargetFailureProvesUnacted } from "../index.ts";

type Attempt = Parameters<typeof automationStudioTargetFailureProvesUnacted>[0];
const missing: NonNullable<Attempt["failure"]> = { category: "target_not_found", code: "example.target.missing", retryable: true, stage: "target_resolution" };
const fault: NonNullable<Attempt["fault"]> = { disposition: "refuse", category: "ambiguous_or_unknown", code: "example.reply.lost", source: "failure_record", effect: "ambiguous", actUncertain: true, reason: "No acknowledgement." };

describe("target evidence before any automatic skip or route", () => {
  it("accepts a genuine pre-target absence, with or without explicit unacted proof", () => {
    expect(automationStudioTargetFailureProvesUnacted({ status: "failed", failure: missing })).toBe(true);
    expect(automationStudioTargetFailureProvesUnacted({ status: "failed", failure: { ...missing, effect: "unacted" } })).toBe(true);
    const { stage: _stage, ...unstaged } = missing;
    expect(automationStudioTargetFailureProvesUnacted({ status: "failed", failure: unstaged })).toBe(true);
    expect(automationStudioTargetFailureProvesUnacted({ status: "succeeded", failure: missing })).toBe(false);
    expect(automationStudioTargetFailureProvesUnacted({ status: "failed" })).toBe(false);
  });

  it("never lets missing-target category text erase ambiguity or an after-action stage", () => {
    const cases: Attempt[] = [
      { status: "failed", failure: { ...missing, effect: "ambiguous" } },
      { status: "failed", failure: missing, fault },
      { status: "failed", failure: { ...missing, stage: "execution" } },
      { status: "failed", failure: { ...missing, stage: "confirmation", effect: "unacted" } },
      { status: "failed", failure: { ...missing, stage: "verification", effect: "unacted" } },
      { status: "failed", failure: missing, fault: { ...fault, effect: "unacted", stage: "verification" } }
    ];
    for (const attempt of cases) expect(automationStudioTargetFailureProvesUnacted(attempt)).toBe(false);
  });

  it("lets a later positive not_landed supersede earlier ambiguous records and fault labels", () => {
    const ambiguous: Attempt = { status: "failed", failure: { ...missing, effect: "ambiguous" }, fault };
    expect(automationStudioTargetFailureProvesUnacted({ ...ambiguous, effectCheck: { result: "not_landed", checkedAt: 2 } })).toBe(true);
    for (const result of ["landed", "unknown"] as const) {
      expect(automationStudioTargetFailureProvesUnacted({ ...ambiguous, effectCheck: { result, checkedAt: 2 } })).toBe(false);
    }
  });

  it("does not reinterpret held, skipped or terminal uncertain child outcomes as unacted", () => {
    const childTrace: NonNullable<AutomationStudioNodeAttemptTrace["childTrace"]> = {
      startedAt: 1,
      finishedAt: 2,
      status: "failed",
      attempts: [],
      values: {},
      effects: [],
      failure: { category: "ambiguous_or_unknown", code: "run.outcome_uncertain", retryable: false, effect: "ambiguous" }
    };
    const checked: Attempt = { status: "failed", failure: missing, effectCheck: { result: "not_landed", checkedAt: 3 } };
    expect(automationStudioTargetFailureProvesUnacted({ ...checked, stateHeld: { rung: "skip_satisfied_node", route: "success" } })).toBe(false);
    expect(automationStudioTargetFailureProvesUnacted({ ...checked, skipped: { reason: "target_absent", code: missing.code } })).toBe(false);
    expect(automationStudioTargetFailureProvesUnacted({ ...checked, childTrace })).toBe(false);
  });
});
