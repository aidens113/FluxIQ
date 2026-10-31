import type { AutomationStudioNodeAttemptTrace } from "../contracts.ts";

/**
 * A missing target permits routing only when stronger evidence does not say
 * the act happened or remains unsettled. A later positive not_landed check
 * supersedes the original ambiguous fault, as it does in fault assessment;
 * it cannot settle a different, terminally uncertain child act.
 */
export function automationStudioTargetFailureProvesUnacted(
  attempt: Pick<AutomationStudioNodeAttemptTrace, "status" | "failure"> & Partial<Pick<AutomationStudioNodeAttemptTrace, "fault" | "effectCheck" | "stateHeld" | "skipped" | "childTrace">>
): boolean {
  const failure = attempt.failure;
  if (attempt.status !== "failed" || !failure) return false;
  if (attempt.childTrace?.status === "failed" && attempt.childTrace.failure?.code === "run.outcome_uncertain") return false;
  if (attempt.stateHeld || attempt.skipped) return false;
  if (attempt.effectCheck) return attempt.effectCheck.result === "not_landed";
  if (failure.effect === "ambiguous" || attempt.fault?.effect === "ambiguous" || attempt.fault?.actUncertain) return false;
  for (const stage of [failure.stage, attempt.fault?.stage]) {
    if (stage === "confirmation" || stage === "verification") return false;
  }
  if (failure.effect === "unacted" || attempt.fault?.effect === "unacted") return true;
  if (failure.stage !== undefined && failure.stage !== "target_resolution") return false;
  return failure.category === "target_not_found" || failure.category === "target_ambiguous" || failure.stage === "target_resolution";
}
