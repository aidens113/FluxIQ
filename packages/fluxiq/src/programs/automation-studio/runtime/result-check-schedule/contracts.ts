// Where a Flow stands in its checking schedule, and what the schedule decided
// about the run that has just finished.
//
// The state is derived from `runtime_runs` and never stored twice. A counter
// column on `flow_settings` was the obvious first idea and is worse on three
// counts: `flow_settings.revision` is bumped by every mutation, so a per-run
// write would churn it and make the settings fingerprint change on every run;
// and a read-modify-write of a counter is a value two concurrent runs of the
// same Flow can lose. Rows that are being written anyway have none of those
// problems and double as the audit trail.

import type { AutomationStudioResultVerificationStatus } from "../result-verification/index.ts";

export type AutomationStudioResultCheckState = {
  /** Finished runs at this epoch, the newest included. 1 is the first run after the Flow last changed. */
  ordinal: number;
  /** The newest checked run's ordinal, or null when no run at this epoch was checked. */
  lastCheckedOrdinal: number | null;
  /** Checks at this epoch whose verdict was `confirmed`. */
  checksPassed: number;
  /** The newest check's status, or null. `unverified` is not a pass. */
  lastStatus: AutomationStudioResultVerificationStatus | null;
};

/**
 * Whether this run is checked, why, and when the next one falls due.
 *
 * `reason` and `code` are recorded on every run, checked or not, so a run that
 * was not put to the question says so rather than being silent about it.
 */
export type AutomationStudioResultCheckDecision = {
  check: boolean;
  /** Core's own sentence, in the person's terms. Never a model's words. */
  reason: string;
  /** The stable code a reader acts on. */
  code: string;
  /** The ordinal of the next run this policy would check, or null when it would check no more. */
  nextCheckAtOrdinal: number | null;
};

/** The codes a decision carries. One per reason, so a reader can tell them apart. */
export const AUTOMATION_STUDIO_RESULT_CHECK_CODES = Object.freeze({
  /** Result checking is turned off for this Flow. */
  disabled: "core.check.disabled",
  /** The shape is `never`: the person asked for no checking, with the feature left on. */
  never: "core.check.never",
  /** Within the run window that follows creation or a change to the Flow. */
  initialWindow: "core.check.initial_window",
  /** The interval since the last check has elapsed. */
  intervalReached: "core.check.interval_reached",
  /** The interval since the last check has not elapsed. */
  intervalNotReached: "core.check.interval_not_reached",
  /** The previous check refuted the result, so the next run's result is judged too. */
  afterRefutation: "core.check.after_refutation",
  /** The previous check settled nothing, so the same question is asked once more. */
  reaskUnsettled: "core.check.reask_unsettled"
});
