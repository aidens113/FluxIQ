// When a stale target is found again (t786, design D2): before attempt 4 of
// 4 (or the last of fewer), and only after an attempt that lost its target
// without acting.

import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import { describe, expect, it } from "vitest";
import type { AutomationStudioNodeAttemptTrace } from "../../contracts.ts";
import { AUTOMATION_STUDIO_TARGET_GONE_CODE, automationStudioReacquireBeforeAttempt, automationStudioStaleTargetFailure } from "../index.ts";

function failed(failure: AutomationStudioFailureRecord, extra: Partial<AutomationStudioNodeAttemptTrace> = {}): AutomationStudioNodeAttemptTrace {
  return { attemptId: "save.attempt.3", nodeId: "save", definitionId: "builtin.policy.action", startedAt: 1, finishedAt: 1, status: "failed", route: "failed", inputs: {}, outputs: {}, effects: [], failure, ...extra };
}

const NOT_FOUND: AutomationStudioFailureRecord = { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution" };

describe("which attempt a re-acquire comes before", () => {
  it("is attempt 4 when a node has four or more, the last when it has two or three, and none for one", () => {
    expect(automationStudioReacquireBeforeAttempt(4)).toBe(4);
    expect(automationStudioReacquireBeforeAttempt(7)).toBe(4);
    expect(automationStudioReacquireBeforeAttempt(3)).toBe(3);
    expect(automationStudioReacquireBeforeAttempt(2)).toBe(2);
    expect(automationStudioReacquireBeforeAttempt(1)).toBeUndefined();
    expect(automationStudioReacquireBeforeAttempt(Number.NaN)).toBeUndefined();
  });
});

describe("a failure that lost its target without acting", () => {
  it.each<[string, AutomationStudioFailureRecord]>([
    ["missing", NOT_FOUND],
    ["ambiguous", { category: "target_ambiguous", code: "web.target.ambiguous", retryable: false, stage: "target_resolution" }],
    ["found while resolving", { category: "unexpected_state", code: "web.target.covered", retryable: true, stage: "target_resolution" }],
    ["stale", { category: "action_failed", code: "web.handle.stale", retryable: true, stage: "execution", effect: "unacted" }],
    ["detached", { category: "action_failed", code: "web.target_detached", retryable: true, stage: "dispatch" }],
    ["renumbered", { category: "action_failed", code: "web.handle.renumbered_by_reload", retryable: true, stage: "dispatch" }]
  ])("counts a %s target", (_case, failure) => {
    expect(automationStudioStaleTargetFailure(failed(failure))).toBe(true);
  });

  it("counts no failure that is not about the target, and no code that only contains the word", () => {
    expect(automationStudioStaleTargetFailure(failed({ category: "action_failed", code: "web.action.rate_limited", retryable: true, stage: "execution", effect: "unacted" }))).toBe(false);
    expect(automationStudioStaleTargetFailure(failed({ category: "timeout", code: "web.staleness_check.timeout", retryable: true, stage: "execution" }))).toBe(false);
    expect(automationStudioStaleTargetFailure({ ...failed(NOT_FOUND), status: "succeeded" })).toBe(false);
    const { failure: _none, ...bare } = failed(NOT_FOUND);
    expect(automationStudioStaleTargetFailure(bare)).toBe(false);
  });

  it("never counts an act that may have happened, was settled, or the run already completed", () => {
    // The producer says the act may have happened.
    expect(automationStudioStaleTargetFailure(failed({ ...NOT_FOUND, stage: "execution", code: "web.handle.stale", effect: "ambiguous" }))).toBe(false);
    // The effect check answered that it landed, or could not tell; one that did not land still counts.
    expect(automationStudioStaleTargetFailure(failed(NOT_FOUND, { effectCheck: { result: "landed", checkedAt: 1 } }))).toBe(false);
    expect(automationStudioStaleTargetFailure(failed(NOT_FOUND, { effectCheck: { result: "unknown", checkedAt: 1 } }))).toBe(false);
    expect(automationStudioStaleTargetFailure(failed(NOT_FOUND, { effectCheck: { result: "not_landed", checkedAt: 1 } }))).toBe(true);
    // Settled as done, or uncertain.
    expect(automationStudioStaleTargetFailure(failed(NOT_FOUND, { stateHeld: { rung: "skip_satisfied_node", route: "success" } }))).toBe(false);
    expect(automationStudioStaleTargetFailure(failed(NOT_FOUND, { fault: { actUncertain: true } as NonNullable<AutomationStudioNodeAttemptTrace["fault"]> }))).toBe(false);
    // The completed-act ledger holds it.
    expect(automationStudioStaleTargetFailure(failed(NOT_FOUND), { actCompleted: true })).toBe(false);
    expect(automationStudioStaleTargetFailure(failed(NOT_FOUND), { actCompleted: false })).toBe(true);
  });

  it("never looks again for an item already found gone", () => {
    expect(automationStudioStaleTargetFailure(failed({ ...NOT_FOUND, code: AUTOMATION_STUDIO_TARGET_GONE_CODE, retryable: false, effect: "unacted" }))).toBe(false);
  });
});
