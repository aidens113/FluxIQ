// The whole recovery's time limit, which is not any one exploration's budget.
//
// Core bounds a single provider call (20s, 45s maximum) and a nested Flow's
// execution, and Phase 2.3 bounds one exploration. None of those bounds the
// thing a person actually waits on: a recovery is a diagnosis, then a plan,
// then possibly several explorations, then a patch and a rerun, and every one
// of those could sit inside its own limit while the whole took a quarter of an
// hour. A run that hangs for fifteen minutes and then reports a budget
// exhaustion is indistinguishable, to the person waiting, from one that hung.
//
// So the recovery carries its own clock, started once, and every step reads the
// time left from it. Two consequences are deliberate.
//
// **It is an absolute instant, not a duration to subtract later.** A deadline
// computed once from a start time cannot drift as it is passed between stages,
// and a stage that never looks at the clock still cannot outlive it, because
// the exploration budget takes the smaller of the two deadlines.
//
// **Which clock ran out is recorded.** An exploration stopped by this deadline
// reports `recovery_deadline_expired`, never `wall_clock_expired`. They are the
// same outcome -- `budget_exhausted` -- and completely different advice: one
// says this exploration needs longer, the other says the recovery as a whole
// does.

/**
 * The default ceiling on one recovery, end to end. Ten minutes.
 *
 * It was two, when a recovery was a diagnosis, a short look and a patch. A
 * recovery now iterates for as long as it is learning something -- a default
 * grant allows twenty-six provider calls -- and at a realistic few seconds a
 * call, two minutes would quietly have become the new call cap, ending
 * explorations that were still making progress. The per-call timeout is
 * unchanged, so a hung call is still caught at its own limit; this bounds only
 * how long a recovery that keeps answering may keep going, and it is still the
 * clock a person watching the run is waiting on.
 */
export const AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_MS = 600_000;

/** The largest a host may set it to. Above this a recovery is a background job. */
export const AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_CEILING_MS = 600_000;

export type AutomationStudioRecoveryDeadline = {
  schemaVersion: "automation-studio.recovery-deadline.v1";
  startedAtMs: number;
  maxDurationMs: number;
  /** The instant the whole recovery must be finished by. Computed once. */
  expiresAtMs: number;
};

/**
 * Start the clock. An out-of-range or non-finite duration is clamped rather
 * than rejected: this is called while a run is already failing, and refusing to
 * start the clock because a configured number was silly would leave the
 * recovery with no clock at all -- which is the condition this file exists to
 * remove.
 */
export function startAutomationStudioRecoveryDeadline(input: { startedAtMs: number; maxDurationMs?: number }): AutomationStudioRecoveryDeadline {
  const requested = Number.isFinite(input.maxDurationMs) ? Number(input.maxDurationMs) : AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_MS;
  const maxDurationMs = Math.min(Math.max(Math.trunc(requested), 1), AUTOMATION_STUDIO_RECOVERY_MAX_DURATION_CEILING_MS);
  const startedAtMs = Number.isFinite(input.startedAtMs) ? Math.trunc(input.startedAtMs) : 0;
  return {
    schemaVersion: "automation-studio.recovery-deadline.v1",
    startedAtMs,
    maxDurationMs,
    expiresAtMs: startedAtMs + maxDurationMs
  };
}

/** Milliseconds left, never negative. Zero means the recovery is out of time. */
export function automationStudioRecoveryDeadlineRemainingMs(deadline: AutomationStudioRecoveryDeadline, nowMs: number): number {
  return Math.max(0, deadline.expiresAtMs - nowMs);
}

export function automationStudioRecoveryDeadlineExpired(deadline: AutomationStudioRecoveryDeadline, nowMs: number): boolean {
  return automationStudioRecoveryDeadlineRemainingMs(deadline, nowMs) === 0;
}
