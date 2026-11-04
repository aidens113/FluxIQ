import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_TASK_RESULT_KINDS,
  AUTOMATION_STUDIO_TASK_RESULT_LABELS,
  checkAutomationStudioTaskAttemptResult,
  type AutomationStudioAttemptAct,
  type AutomationStudioTaskAttempt,
  type AutomationStudioTaskResult
} from "../index.ts";

const LANDED: AutomationStudioAttemptAct = { id: "act-1", what: "Added the kettle", where: "shop.example", classes: [], state: "landed" };

function resultOf(fields: Partial<AutomationStudioTaskResult> = {}): AutomationStudioTaskResult {
  return { attemptId: "attempt-1", kind: "partial", label: "unverified", timesChecked: 0, source: "exploration", acts: [], ...fields };
}

function issuesOf(status: AutomationStudioTaskAttempt["status"], result: AutomationStudioTaskResult | undefined): string[] {
  const check = checkAutomationStudioTaskAttemptResult({ attemptId: "attempt-1", status }, result);
  return check.ok ? [] : check.issues;
}

describe("checkAutomationStudioTaskAttemptResult", () => {
  it("passes an achieved attempt with a confirmed result of any kind", () => {
    for (const kind of AUTOMATION_STUDIO_TASK_RESULT_KINDS) {
      expect(issuesOf("achieved", resultOf({ kind, label: "confirmed", timesChecked: 1, acts: [LANDED] })), kind).toEqual([]);
    }
  });

  it("refuses an achieved attempt with no result", () => {
    expect(issuesOf("achieved", undefined)).toEqual(["task_outcome.achieved_needs_result"]);
  });

  it("refuses an achieved attempt whose result is not confirmed", () => {
    expect(issuesOf("achieved", resultOf({ kind: "rows", label: "unverified", timesChecked: 1 }))).toEqual(["task_outcome.achieved_not_confirmed"]);
    expect(issuesOf("achieved", resultOf({ kind: "rows", label: "refuted", timesChecked: 2 }))).toEqual(["task_outcome.achieved_not_confirmed"]);
  });

  it("refuses a budget-out with no result: even one that found nothing has an empty partial", () => {
    expect(issuesOf("budget_out", undefined)).toEqual(["task_outcome.budget_out_needs_result"]);
    expect(issuesOf("budget_out", resultOf())).toEqual([]);
  });

  it("passes a budget-out's rows or partial, not settled or refuted, and says what it got honestly", () => {
    for (const kind of ["rows", "partial"] as const) {
      expect(issuesOf("budget_out", resultOf({ kind, label: "unverified" })), kind).toEqual([]);
      expect(issuesOf("budget_out", resultOf({ kind, label: "refuted", timesChecked: 1 })), kind).toEqual([]);
    }
  });

  it("refuses a budget-out labelled confirmed: a confirmed result is achieved", () => {
    expect(issuesOf("budget_out", resultOf({ kind: "rows", label: "confirmed", timesChecked: 1 }))).toEqual(["task_outcome.budget_out_but_confirmed"]);
  });

  it("refuses a budget-out of any other kind", () => {
    expect(issuesOf("budget_out", resultOf({ kind: "plain_answer" }))).toEqual(["task_outcome.budget_out_not_a_partial_or_rows"]);
    expect(issuesOf("budget_out", resultOf({ kind: "done_on_site", acts: [LANDED] }))).toEqual(["task_outcome.budget_out_not_a_partial_or_rows"]);
  });

  it("says every issue a pair has", () => {
    expect(issuesOf("budget_out", resultOf({ attemptId: "attempt-2", kind: "plain_answer", label: "confirmed", timesChecked: 1 }))).toEqual([
      "task_outcome.other_attempts_result",
      "task_outcome.budget_out_not_a_partial_or_rows",
      "task_outcome.budget_out_but_confirmed"
    ]);
  });

  it("refuses another attempt's result, on any status", () => {
    for (const status of ["working", "waiting_for_person", "achieved", "budget_out", "stopped_by_person"] as const) {
      expect(issuesOf(status, resultOf({ attemptId: "attempt-2" })), status).toEqual(["task_outcome.other_attempts_result"]);
    }
  });

  it("lets an attempt still going, or stopped by a person, hold a result or none", () => {
    for (const status of ["working", "waiting_for_person", "stopped_by_person"] as const) {
      expect(issuesOf(status, undefined), status).toEqual([]);
      for (const label of AUTOMATION_STUDIO_TASK_RESULT_LABELS) expect(issuesOf(status, resultOf({ label, timesChecked: 1 })), status).toEqual([]);
    }
  });
});
