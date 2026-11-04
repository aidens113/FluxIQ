// How one row reads when nobody is working on it: every status, every wait reason, and the one
// waiting row that really did end its work.
import { describe, expect, it } from "vitest";
import { automationStudioTaskAttemptNoLoopsCaught, parseAutomationStudioTaskAttempt, type AutomationStudioTaskAttempt } from "@fluxiq/contracts/automation";
import type { AutomationStudioAnswerFirstAttemptRecord } from "../../attempt-store/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_CHECK_MISSING } from "../check-missing.ts";
import { automationStudioAnswerFirstInterruptedView } from "../interrupted-view.ts";

const FIELDS = {
  taskId: "task.a", attemptId: "attempt.a", ordinal: 2, projectId: "project.a", flowId: "flow.a", runId: "run.a", path: "run_flow_then_explore" as const,
  spend: { calls: 4, inputTokens: 40, outputTokens: 20, usd: 0.2, ms: 900 }, budget: { usd: 1 }, liveSteps: 3, loopsCaught: automationStudioTaskAttemptNoLoopsCaught(), startedAtMs: 100
};
const row = (status: Record<string, unknown>, missingWhat?: string): AutomationStudioAnswerFirstAttemptRecord => ({
  attempt: { ...FIELDS, ...status } as AutomationStudioTaskAttempt,
  tried: { version: 1, tried: [], approaches: 2 },
  steps: [],
  ...(missingWhat === undefined ? {} : { result: { attemptId: "attempt.a", kind: "partial", label: "unverified", timesChecked: 0, source: "exploration", acts: [], missingWhat } })
});

describe("a row nobody is working on", () => {
  it.each([
    [{ status: "working" }],
    [{ status: "waiting_for_person", waitingFor: "permission" }],
    [{ status: "waiting_for_person", waitingFor: "stuck_in_a_loop" }],
    [{ status: "waiting_for_person", waitingFor: "person_only_check" }]
  ])("%j reads as interrupted, keeping what it holds", (status) => {
    const before = row(status, "It ended without a confirmed result.");
    const view = automationStudioAnswerFirstInterruptedView(before);
    expect(view?.attempt).toEqual({ ...FIELDS, status: "waiting_for_person", waitingFor: "interrupted" });
    expect(view?.tried).toEqual(before.tried);
    expect(view?.result).toEqual(before.result);
    expect(parseAutomationStudioTaskAttempt(view?.attempt).ok).toBe(true);
  });

  it("the ending of a check nobody could be asked about stays as it is", () => {
    expect(automationStudioAnswerFirstInterruptedView(row({ status: "waiting_for_person", waitingFor: "person_only_check" }, AUTOMATION_STUDIO_ANSWER_FIRST_CHECK_MISSING))).toBeUndefined();
  });

  it.each([
    [{ status: "waiting_for_person", waitingFor: "interrupted" }],
    [{ status: "achieved", endedAtMs: 200 }],
    [{ status: "budget_out", endedAtMs: 200 }],
    [{ status: "stopped_by_person", endedAtMs: 200 }]
  ])("%j stays as it is", (status) => {
    expect(automationStudioAnswerFirstInterruptedView(row(status))).toBeUndefined();
  });
});
