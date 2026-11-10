import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_TASK_ATTEMPT_PATHS,
  AUTOMATION_STUDIO_TASK_ATTEMPT_SIMULATION_VERDICTS,
  AUTOMATION_STUDIO_TASK_ATTEMPT_STATUSES,
  AUTOMATION_STUDIO_TASK_ATTEMPT_WAIT_REASONS,
  automationStudioTaskAttemptNoLoopsCaught,
  parseAutomationStudioTaskAttempt,
  type AutomationStudioTaskAttempt
} from "../index.ts";

const VALID: AutomationStudioTaskAttempt = {
  taskId: "task-1",
  attemptId: "attempt-1",
  ordinal: 1,
  projectId: "project-1",
  flowId: "flow-1",
  runId: "run-mvy8n92p-95cfe1d0",
  path: "explore",
  status: "achieved",
  spend: { calls: 12, inputTokens: 18_000, outputTokens: 2_400, usd: 1.12, ms: 194_000 },
  budget: { usd: 5 },
  liveSteps: 31,
  simulation: { verdict: "passed", flags: 1 },
  loopsCaught: automationStudioTaskAttemptNoLoopsCaught(),
  startedAtMs: 1_000,
  endedAtMs: 2_000
};

describe("what a later attempt began from", () => {
  const startedFrom = { route: "use", attemptId: "attempt-0", stepsDigest: "a".repeat(64) } as const;

  it("is carried through the parse, and is absent where nothing was found", () => {
    expect(parseAutomationStudioTaskAttempt({ ...VALID, startedFrom })).toEqual({ ok: true, attempt: { ...VALID, startedFrom } });
    expect(parseAutomationStudioTaskAttempt(VALID)).toEqual({ ok: true, attempt: VALID });
  });

  it("names what it did with them, whose they were and a digest, and nothing else", () => {
    for (const bad of [{ ...startedFrom, route: "build" }, { ...startedFrom, attemptId: "" }, { ...startedFrom, stepsDigest: "the steps" }, { ...startedFrom, page: "https://shop.example.test" }]) {
      const parsed = parseAutomationStudioTaskAttempt({ ...VALID, startedFrom: bad });
      expect(parsed.ok ? [] : parsed.issues).toEqual(["task_attempt.invalid_started_from"]);
    }
  });
});

function issuesOf(value: unknown): string[] {
  const result = parseAutomationStudioTaskAttempt(value);
  return result.ok ? [] : result.issues;
}

describe("parseAutomationStudioTaskAttempt", () => {
  it("returns a fresh attempt", () => {
    const parsed = parseAutomationStudioTaskAttempt(VALID);
    expect(parsed).toEqual({ ok: true, attempt: VALID });
    if (!parsed.ok) throw new Error("expected a valid attempt");
    expect(parsed.attempt).not.toBe(VALID);
    expect(parsed.attempt.spend).not.toBe(VALID.spend);
    expect(parsed.attempt.loopsCaught).not.toBe(VALID.loopsCaught);
  });

  // The user's hard rule: a task ends only with its result, its budget gone, or a person stopping it.
  it("has no status for a task that failed, and refuses every word for one", () => {
    expect(AUTOMATION_STUDIO_TASK_ATTEMPT_STATUSES).toEqual(["working", "waiting_for_person", "achieved", "budget_out", "stopped_by_person"]);
    for (const status of ["failed", "failure", "not_doable", "not_finished", "refuted", "cancelled", "timed_out", "partial", "", null, undefined]) {
      expect(issuesOf({ ...VALID, status }), String(status)).toContain("task_attempt.invalid_status");
    }
  });

  it("says when an attempt ended exactly when it has ended", () => {
    for (const status of ["achieved", "budget_out", "stopped_by_person"]) {
      expect(issuesOf({ ...VALID, status })).toEqual([]);
      const { endedAtMs: _endedAtMs, ...open } = VALID;
      expect(issuesOf({ ...open, status })).toEqual(["task_attempt.ending_needs_ended_at"]);
    }
    for (const fields of [{ status: "working" }, { status: "waiting_for_person", waitingFor: "permission" }]) {
      expect(issuesOf({ ...VALID, ...fields })).toEqual(["task_attempt.ended_at_before_ending"]);
      const { endedAtMs: _endedAtMs, ...open } = VALID;
      expect(issuesOf({ ...open, ...fields })).toEqual([]);
    }
    expect(issuesOf({ ...VALID, endedAtMs: 999 })).toEqual(["task_attempt.ended_before_started"]);
  });

  it("takes every path, and needs a Flow on a path that runs one", () => {
    for (const path of AUTOMATION_STUDIO_TASK_ATTEMPT_PATHS) expect(issuesOf({ ...VALID, path })).toEqual([]);
    expect(issuesOf({ ...VALID, path: "legacy" })).toEqual(["task_attempt.invalid_path"]);
    const { flowId: _flowId, ...noFlow } = VALID;
    expect(issuesOf({ ...noFlow, path: "explore" })).toEqual([]);
    for (const path of ["run_flow", "run_flow_then_repair", "run_flow_then_explore"]) {
      expect(issuesOf({ ...noFlow, path })).toEqual(["task_attempt.flow_path_needs_flow"]);
    }
  });

  it("reads spend, budget, steps and ordinal strictly", () => {
    expect(issuesOf({ ...VALID, spend: { ...VALID.spend, usd: -1 } })).toContain("task_attempt.invalid_spend");
    expect(issuesOf({ ...VALID, spend: { ...VALID.spend, usd: Number.NaN } })).toContain("task_attempt.invalid_spend");
    expect(issuesOf({ ...VALID, spend: { ...VALID.spend, calls: 1.5 } })).toContain("task_attempt.invalid_spend");
    expect(issuesOf({ ...VALID, spend: { ...VALID.spend, extra: 1 } })).toContain("task_attempt.invalid_spend");
    expect(issuesOf({ ...VALID, budget: { usd: "5" } })).toContain("task_attempt.invalid_budget");
    expect(issuesOf({ ...VALID, budget: { usd: 5, currency: "USD" } })).toContain("task_attempt.invalid_budget");
    expect(issuesOf({ ...VALID, liveSteps: -1 })).toContain("task_attempt.invalid_live_steps");
    expect(issuesOf({ ...VALID, ordinal: 0 })).toContain("task_attempt.invalid_ordinal");
    expect(issuesOf({ ...VALID, loopsCaught: {} })).toContain("task_attempt.invalid_loops_caught");
    const { loopsCaught: _loopsCaught, ...noLoops } = VALID;
    expect(issuesOf(noLoops)).toContain("task_attempt.invalid_loops_caught");
  });

  it("reads acts with no row as a whole number, absent as zero, and keeps a record written before it", () => {
    expect(issuesOf(VALID)).toEqual([]);
    const kept = parseAutomationStudioTaskAttempt({ ...VALID, actsWithNoRow: 2 });
    expect(kept.ok && kept.attempt.actsWithNoRow).toBe(2);
    const before = parseAutomationStudioTaskAttempt(VALID);
    expect(before.ok && before.attempt.actsWithNoRow).toBeUndefined();
    for (const bad of [-1, 1.5, "2", null]) expect(issuesOf({ ...VALID, actsWithNoRow: bad })).toEqual(["task_attempt.invalid_acts_with_no_row"]);
  });

  it("reads a caller's checking turned off as true only, and absent as checking on", () => {
    const off = parseAutomationStudioTaskAttempt({ ...VALID, checkingOff: true });
    expect(off.ok && off.attempt.checkingOff).toBe(true);
    const on = parseAutomationStudioTaskAttempt(VALID);
    expect(on.ok && "checkingOff" in on.attempt).toBe(false);
    for (const bad of [false, "true", 1, null]) expect(issuesOf({ ...VALID, checkingOff: bad })).toEqual(["task_attempt.invalid_checking_off"]);
  });

  it("takes every simulation verdict and no flags on one that did not run", () => {
    for (const verdict of AUTOMATION_STUDIO_TASK_ATTEMPT_SIMULATION_VERDICTS) {
      expect(issuesOf({ ...VALID, simulation: { verdict, flags: 0 } })).toEqual([]);
    }
    expect(issuesOf({ ...VALID, simulation: { verdict: "not_run", flags: 1 } })).toEqual(["task_attempt.invalid_simulation"]);
    expect(issuesOf({ ...VALID, simulation: { verdict: "proved", flags: 0 } })).toEqual(["task_attempt.invalid_simulation"]);
    const { simulation: _simulation, ...noSimulation } = VALID;
    expect(issuesOf(noSimulation)).toEqual([]);
  });

  it("holds nothing it does not name: no address into a page, page text or token", () => {
    for (const key of ["selector", "pageText", "token", "pairingToken", "notes", "failure"]) {
      expect(issuesOf({ ...VALID, [key]: "x" }), key).toEqual(["task_attempt.unknown_key"]);
    }
  });

  it("takes ids only in the id form, so text cannot travel as an id", () => {
    for (const key of ["taskId", "attemptId", "projectId", "flowId", "runId"]) {
      expect(issuesOf({ ...VALID, [key]: "two words" }).length, key).toBe(1);
      expect(issuesOf({ ...VALID, [key]: ".." }).length, key).toBe(1);
    }
  });

  it("refuses what is not a record, and never throws", () => {
    for (const value of [null, 1, "attempt", []]) expect(issuesOf(value)).toEqual(["task_attempt.not_object"]);
    const hostile = { ...VALID, get status(): string { throw new Error("no"); } };
    expect(issuesOf(hostile)).toEqual(["task_attempt.invalid"]);
  });
});

describe("what a waiting attempt waits for", () => {
  const { endedAtMs: _endedAtMs, status: _status, ...open } = VALID;

  it("takes each closed reason, and keeps it", () => {
    expect(AUTOMATION_STUDIO_TASK_ATTEMPT_WAIT_REASONS).toEqual(["permission", "person_only_check", "stuck_in_a_loop", "model_key_locked", "interrupted"]);
    for (const waitingFor of AUTOMATION_STUDIO_TASK_ATTEMPT_WAIT_REASONS) {
      const attempt = { ...open, status: "waiting_for_person", waitingFor };
      expect(parseAutomationStudioTaskAttempt(attempt)).toEqual({ ok: true, attempt });
    }
  });

  it("refuses a wait with no reason, and an unknown one", () => {
    expect(issuesOf({ ...open, status: "waiting_for_person" })).toEqual(["task_attempt.waiting_needs_reason"]);
    for (const waitingFor of ["budget", "stuck", "", null, 1]) {
      expect(issuesOf({ ...open, status: "waiting_for_person", waitingFor }), String(waitingFor)).toEqual(["task_attempt.invalid_waiting_for"]);
    }
  });

  it("refuses a reason on any other status", () => {
    expect(issuesOf({ ...open, status: "working", waitingFor: "permission" })).toEqual(["task_attempt.reason_without_waiting"]);
    expect(issuesOf({ ...VALID, waitingFor: "permission" })).toEqual(["task_attempt.reason_without_waiting"]);
  });

  // Enforced by `tsc --noEmit` (`pnpm --filter @fluxiq/contracts check`), which includes this file.
  it("cannot be written without its reason, or with one elsewhere", () => {
    // @ts-expect-error a wait with no reason is not an attempt.
    const noReason: AutomationStudioTaskAttempt = { ...open, status: "waiting_for_person" };
    // @ts-expect-error a reason belongs only to a wait.
    const stray: AutomationStudioTaskAttempt = { ...open, status: "working", waitingFor: "permission" };
    expect(issuesOf(noReason)).toEqual(["task_attempt.waiting_needs_reason"]);
    expect(issuesOf(stray)).toEqual(["task_attempt.reason_without_waiting"]);
  });
});
