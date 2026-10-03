import type { JsonObject } from "../../../../core/index.ts";

// How a promotion decision held for a run's judged end reads on the record
// (t249). Kept here, beside the reading of "this run changed the Flow", because
// the result verification and the refuted-result repair read it as well as the
// service, and this directory depends on nothing they do.

/** What a deferred promotion decision waits for, as its `applyAt`. */
export const AUTOMATION_STUDIO_JUDGED_PROMOTION_APPLY_AT = "judged_whole_run";

/**
 * Whether a decision is allowed unattended, held for the judged end of a run,
 * and not yet settled -- of run `runId`, when one is named.
 */
export function automationStudioDecisionAwaitsJudgedRun(decision: unknown, runId?: string): boolean {
  if (!decision || typeof decision !== "object" || Array.isArray(decision)) return false;
  const held = decision as JsonObject;
  return held.autoApply === true
    && held.applyAt === AUTOMATION_STUDIO_JUDGED_PROMOTION_APPLY_AT
    && held.applied === false
    && held.settledAt === undefined
    && (runId === undefined || held.runId === undefined || held.runId === runId);
}

/**
 * The pending patches a pass of this run has already run as its candidate:
 * the resume's (`adaptiveRetry`) and the whole-Flow re-run's (`repairedRerun`).
 */
export function automationStudioRunCandidateAdaptationIds(detail: { metadata?: JsonObject | undefined }): string[] {
  const ids = (["adaptiveRetry", "repairedRerun"] as const).flatMap((key) => {
    const pass = detail.metadata?.[key];
    const listed = pass && typeof pass === "object" && !Array.isArray(pass) ? pass.candidateAdaptationIds : undefined;
    return Array.isArray(listed) ? listed.filter((id): id is string => typeof id === "string") : [];
  });
  return [...new Set(ids)];
}

/**
 * Whether the run holds a patch allowed unattended that no pass has run yet:
 * one a re-run from the Flow's start, on the unapplied candidate, would judge.
 * Read off the run's own receipts, which is where a recovery records its patches.
 */
export function automationStudioRunHasUntriedPatch(detail: { metadata?: JsonObject | undefined }): boolean {
  const attempts = Array.isArray(detail.metadata?.runtimePatchAttempts) ? detail.metadata.runtimePatchAttempts : [];
  const ran = new Set(automationStudioRunCandidateAdaptationIds(detail));
  return attempts.some((attempt) => attempt !== null && typeof attempt === "object" && !Array.isArray(attempt)
    && typeof attempt.adaptationId === "string" && !ran.has(attempt.adaptationId)
    && automationStudioDecisionAwaitsJudgedRun(attempt.approvalDecision));
}
