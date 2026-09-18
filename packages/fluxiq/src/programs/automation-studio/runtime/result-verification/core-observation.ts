// The verdicts Core reaches on its own, from arithmetic over the result.
//
// Two of the four failures measured on 2026-09-17 need no model to catch, and
// must therefore be caught whether or not one is configured, whether or not the
// provider answers, and whether or not the run was allowed to spend anything:
//
//   * a run that stored no rows at all while a record output ran, and
//   * a run whose every row was refused by record validation, which is the same
//     zero arrived at a different way and is worth saying differently, because
//     the repair is different -- the first is an extraction that found nothing,
//     the second is a schema that does not fit what was found.
//
// Both are counts Core already holds on the run's dataset summaries. Nothing
// here reads a row, a column, or the request.
//
// A deterministic finding wins outright: it is not a hint to a model call, it
// is the answer. Zero rows cannot answer a request for rows, and there is no
// reading of a request under which it could, so spending a call to be told so
// would be spending a call on a settled question.

import { AUTOMATION_STUDIO_FAILURE_RECORD_LIMITS, type AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { AutomationStudioResultVerdict, AutomationStudioResultVerification, AutomationStudioRunResultSummary } from "./contracts.ts";

/** Core's codes for a verdict it reached itself. */
export const AUTOMATION_STUDIO_RESULT_OBSERVATION_CODES = Object.freeze({
  everyRecordRefused: "core.result.every_record_refused",
  noRecords: "core.result.no_records"
} as const);

/**
 * The verdict Core's own counts reach, or `undefined` when they reach none and
 * the question is genuinely one only a reading of the request can settle.
 *
 * `undefined` is not "it answers". It means Core has nothing to say, and the
 * caller must go on to ask.
 */
export function automationStudioResultCoreObservation(summary: AutomationStudioRunResultSummary): AutomationStudioResultVerification | undefined {
  if (summary.recordSetCount === 0) return undefined;
  if (summary.totalRecordCount > 0) return undefined;
  const codes = AUTOMATION_STUDIO_RESULT_OBSERVATION_CODES;
  if (summary.totalRefusedCount > 0) {
    return refused({
      code: codes.everyRecordRefused,
      reason: "Every row the run found was refused by record validation, so the run stored nothing and its result cannot answer the request.",
      observation: `${summary.totalRefusedCount} ${rows(summary.totalRefusedCount)} refused, 0 stored, across ${summary.recordSetCount} record ${sets(summary.recordSetCount)}.`
    });
  }
  return refused({
    code: codes.noRecords,
    reason: "The run stored no records, so there is nothing for its result to answer the request with.",
    observation: `0 records stored across ${summary.recordSetCount} record ${sets(summary.recordSetCount)}, and no row was refused.`
  });
}

/**
 * The failure a run reports when its result does not answer the request.
 *
 * `output_not_observed` is Core's existing name for "the action reported
 * success and its intended effect was never observed", which is this exact
 * situation one level up: the run reported success and what it was for never
 * arrived. No new failure category is introduced, so every consumer that
 * already reads the category list keeps working.
 */
export function automationStudioResultFailureRecord(input: { verdict: AutomationStudioResultVerdict; code: string; observation: string }): AutomationStudioFailureRecord {
  return {
    // `does_not_answer` is a result that was judged wrong; `unsure` is one
    // nobody could judge, which is Core's existing "the producer could not
    // determine a cause". Both fail the run; only one of them claims to know
    // why, and a run record that conflated the two would be making a claim
    // nothing supports.
    category: input.verdict === "does_not_answer" ? "output_not_observed" : "ambiguous_or_unknown",
    code: input.code,
    retryable: false,
    stage: "verification",
    expected: "A result that answers the request the Flow was built for.",
    actual: boundedObservation(input.observation)
  };
}

/** The failure record's own bound on a description, applied before the record is built rather than dropping it whole. */
function boundedObservation(observation: string): string {
  const limit = AUTOMATION_STUDIO_FAILURE_RECORD_LIMITS.textMaxLength;
  return observation.length <= limit ? observation : `${observation.slice(0, limit - 1)}…`;
}

function refused(input: { code: string; reason: string; observation: string }): AutomationStudioResultVerification {
  return {
    schemaVersion: "automation-studio.result-verification.v1",
    verdict: "does_not_answer",
    basis: "core_observation",
    code: input.code,
    reason: input.reason,
    observation: input.observation,
    failure: automationStudioResultFailureRecord({ verdict: "does_not_answer", code: input.code, observation: input.observation })
  };
}

function rows(count: number): string {
  return count === 1 ? "row was" : "rows were";
}

function sets(count: number): string {
  return count === 1 ? "set" : "sets";
}
