import type { JsonObject } from "../../../../core/index.ts";
import type { AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY } from "../recovery/refuted-result/index.ts";

/**
 * Where a run's metadata records its re-author (t267 S4).
 *
 * Written here rather than imported, because the value edge would close a cycle
 * -- `recovery/refuted-result/reauthor.ts` already calls into this directory --
 * and typed against the constant it mirrors, so the two cannot drift.
 */
const REAUTHOR_METADATA_KEY: typeof AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY = "resultReauthor";

/**
 * Whether a run left the Flow behaving differently from now on: one of the
 * adaptations the run recorded was applied automatically by a runtime patch
 * attempt, or the run's re-author was kept (`applied: true` on its marker, set
 * only once a whole re-run with it was judged to answer). An adaptation that
 * only waits for review changes nothing yet, and neither does an auto-applied
 * patch the run never recorded as its adaptation, nor a re-author not kept.
 *
 * The run endpoint's answer and every stored run summary read it from here, so
 * `run-runtime-session` and `list-flow-runs` cannot disagree about the same run.
 */
export function automationStudioRunChangedDurableBehavior(detail: { adaptationIds?: readonly string[] | undefined; metadata?: JsonObject | undefined }): boolean {
  return runtimePatchApplied(detail) || reauthorKept(detail.metadata);
}

function runtimePatchApplied(detail: { adaptationIds?: readonly string[] | undefined; metadata?: JsonObject | undefined }): boolean {
  const adaptationIds = detail.adaptationIds ?? [];
  if (!adaptationIds.length) return false;
  const attempts = detail.metadata?.runtimePatchAttempts;
  if (!Array.isArray(attempts)) return false;
  return adaptationIds.some((adaptationId) => attempts.some((attempt) => {
    if (!attempt || typeof attempt !== "object" || Array.isArray(attempt)) return false;
    return attempt.adaptationId === adaptationId && automationStudioDecisionAppliedAutomatically(attempt.approvalDecision);
  }));
}

/** The run's re-author marker names its adaptation and says it was kept; read as `run-runtime-session` reads it. */
function reauthorKept(metadata: JsonObject | undefined): boolean {
  const marker = metadata?.[REAUTHOR_METADATA_KEY];
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) return false;
  return typeof marker.adaptationId === "string" && marker.applied === true;
}

/**
 * Whether one promotion decision put its change on the stored Flow without a
 * person. Since t249 an unattended apply waits for the run's judged end, so a
 * decision allowing it says `applied: false` until the run's result was judged
 * to answer, and `applied: true` once the change was applied; a decision
 * recorded before t249 carries no `applied` and was applied when it was made.
 */
export function automationStudioDecisionAppliedAutomatically(decision: unknown): boolean {
  if (!decision || typeof decision !== "object" || Array.isArray(decision)) return false;
  const recorded = decision as { autoApply?: unknown; applied?: unknown };
  return recorded.autoApply === true && recorded.applied !== false;
}
