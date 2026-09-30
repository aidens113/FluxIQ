import type { JsonObject } from "../../../../core/index.ts";

/**
 * Whether a run left the Flow behaving differently from now on: one of the
 * adaptations the run recorded was applied automatically by a runtime patch
 * attempt. An adaptation that only waits for review changes nothing yet, and
 * neither does an auto-applied patch the run never recorded as its adaptation.
 *
 * The run endpoint's answer and every stored run summary read it from here, so
 * `run-runtime-session` and `list-flow-runs` cannot disagree about the same run.
 */
export function automationStudioRunChangedDurableBehavior(detail: { adaptationIds?: readonly string[] | undefined; metadata?: JsonObject | undefined }): boolean {
  const adaptationIds = detail.adaptationIds ?? [];
  if (!adaptationIds.length) return false;
  const attempts = detail.metadata?.runtimePatchAttempts;
  if (!Array.isArray(attempts)) return false;
  return adaptationIds.some((adaptationId) => attempts.some((attempt) => {
    if (!attempt || typeof attempt !== "object" || Array.isArray(attempt)) return false;
    const decision = attempt.approvalDecision;
    return attempt.adaptationId === adaptationId
      && Boolean(decision) && typeof decision === "object" && !Array.isArray(decision)
      && (decision as { autoApply?: unknown }).autoApply === true;
  }));
}
