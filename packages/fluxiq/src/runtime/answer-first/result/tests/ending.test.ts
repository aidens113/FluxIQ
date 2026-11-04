import { describe, expect, it } from "vitest";
import { automationStudioTaskAttemptNoLoopsCaught, type AutomationStudioAttemptAct, type AutomationStudioTaskAttempt, type AutomationStudioTaskResult } from "@fluxiq/contracts/automation";
import { automationStudioAnswerFirstEnding } from "../ending.ts";
import { AutomationStudioAnswerFirstEndingError } from "../ending-error.ts";
import { automationStudioAnswerFirstResult } from "../result.ts";

const LANDED: AutomationStudioAttemptAct = { id: "act.1", what: "Booked the hall", where: "the bookings page", classes: ["create_new"], state: "landed" };

function attempt(status: "achieved" | "budget_out" | "stopped_by_person"): AutomationStudioTaskAttempt {
  return {
    taskId: "task.1", attemptId: "attempt.1", ordinal: 1, projectId: "project.1", path: "explore", status,
    spend: { calls: 3, inputTokens: 100, outputTokens: 10, usd: 0.5, ms: 1000 }, budget: { usd: 5 }, liveSteps: 2,
    loopsCaught: automationStudioTaskAttemptNoLoopsCaught(),
    startedAtMs: 1, endedAtMs: 2
  };
}

const confirmed = automationStudioAnswerFirstResult({ attemptId: "attempt.1", label: "confirmed", timesChecked: 1, acts: [LANDED] });
const unverified = automationStudioAnswerFirstResult({ attemptId: "attempt.1", label: "unverified", timesChecked: 0, acts: [LANDED] });

const issuesOf = (run: () => unknown): readonly string[] => {
  try {
    run();
  } catch (error) {
    if (error instanceof AutomationStudioAnswerFirstEndingError) return error.issues;
    throw error;
  }
  return [];
};

describe("an attempt's ending", () => {
  it("achieved with a confirmed result stands", () => {
    expect(automationStudioAnswerFirstEnding({ attempt: attempt("achieved"), result: confirmed })).toMatchObject({ attempt: { status: "achieved" }, result: { label: "confirmed" } });
  });

  it.each([
    ["unverified", unverified],
    ["refuted", automationStudioAnswerFirstResult({ attemptId: "attempt.1", label: "refuted", timesChecked: 1, acts: [] })]
  ])("achieved with a result %s throws", (_label, result) => {
    expect(issuesOf(() => automationStudioAnswerFirstEnding({ attempt: attempt("achieved"), result }))).toEqual(["task_outcome.achieved_not_confirmed"]);
  });

  it("achieved with no result throws", () => {
    expect(issuesOf(() => automationStudioAnswerFirstEnding({ attempt: attempt("achieved"), result: undefined }))).toEqual(["task_outcome.achieved_needs_result"]);
  });

  it("achieved with a result that does not parse throws: it cannot be called confirmed", () => {
    const broken = { ...confirmed, kind: "nonsense" } as unknown as AutomationStudioTaskResult;
    expect(issuesOf(() => automationStudioAnswerFirstEnding({ attempt: attempt("achieved"), result: broken }))).toEqual(["task_outcome.achieved_not_confirmed"]);
  });

  it("another attempt's result throws", () => {
    const other = automationStudioAnswerFirstResult({ attemptId: "attempt.2", label: "confirmed", timesChecked: 1, acts: [] });
    expect(issuesOf(() => automationStudioAnswerFirstEnding({ attempt: attempt("achieved"), result: other }))).toEqual(["task_outcome.other_attempts_result"]);
  });

  it("an attempt that does not parse throws, with its codes", () => {
    const { endedAtMs: _endedAtMs, ...open } = attempt("achieved");
    expect(issuesOf(() => automationStudioAnswerFirstEnding({ attempt: open as AutomationStudioTaskAttempt, result: confirmed }))).toContain("task_attempt.ending_needs_ended_at");
  });
});

describe("a budget-out", () => {
  it("with nothing still ends, on an empty partial labelled as not confirmed", () => {
    const { result } = automationStudioAnswerFirstEnding({ attempt: attempt("budget_out"), result: undefined });
    expect(result).toMatchObject({ attemptId: "attempt.1", kind: "partial", label: "unverified", timesChecked: 0, acts: [] });
  });

  it("carries the writer's best result so far, acts included", () => {
    const { result } = automationStudioAnswerFirstEnding({ attempt: attempt("budget_out"), result: unverified });
    expect(result).toMatchObject({ kind: "partial", label: "unverified", acts: [LANDED] });
  });

  it("with a result that does not parse ends on the honest smaller record, keeping its acts", () => {
    const broken = { ...unverified, rows: { runId: "" }, kind: "rows" } as unknown as AutomationStudioTaskResult;
    const { result } = automationStudioAnswerFirstEnding({ attempt: attempt("budget_out"), result: broken });
    expect(result).toMatchObject({ kind: "partial", label: "unverified", acts: [LANDED] });
    expect(result?.rows).toBeUndefined();
  });

  it("labelled confirmed throws: a confirmed result is achieved", () => {
    const rowsConfirmed = automationStudioAnswerFirstResult({ attemptId: "attempt.1", label: "confirmed", timesChecked: 1, acts: [] });
    expect(issuesOf(() => automationStudioAnswerFirstEnding({ attempt: attempt("budget_out"), result: rowsConfirmed }))).toEqual(["task_outcome.budget_out_but_confirmed"]);
  });

  it("of a kind it may not be throws", () => {
    expect(issuesOf(() => automationStudioAnswerFirstEnding({ attempt: attempt("budget_out"), result: { ...unverified, kind: "done_on_site" } }))).toEqual(["task_outcome.budget_out_not_a_partial_or_rows"]);
  });
});

describe("a person's Stop", () => {
  it("may hold a result or none", () => {
    expect(automationStudioAnswerFirstEnding({ attempt: attempt("stopped_by_person"), result: undefined }).result).toBeUndefined();
    expect(automationStudioAnswerFirstEnding({ attempt: attempt("stopped_by_person"), result: unverified }).result).toMatchObject({ label: "unverified" });
  });
});

it("returns fresh parsed copies, never the caller's objects", () => {
  const given = attempt("achieved");
  const ended = automationStudioAnswerFirstEnding({ attempt: given, result: confirmed });
  expect(ended.attempt).not.toBe(given);
  expect(ended.result).not.toBe(confirmed);
});
