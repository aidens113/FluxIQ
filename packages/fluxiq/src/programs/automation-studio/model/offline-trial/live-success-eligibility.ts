// Whether a trial result is a live success. Only an actual whole live run that
// passed, recorded as the original result and naming the live episode it
// observed, qualifies. A recorded, computed or modeled pass never does, at any
// scope (trace-offline-trials-plan, Decision 3; source plan section 8).

import { validateAutomationStudioTrialEvidenceResult } from "./validate-trial-evidence-result.ts";

/** Whether `input` is a valid, original, live, full-live-run pass with its live episode id. */
export function isAutomationStudioTrialEvidenceLiveSuccess(input: unknown): boolean {
  const answer = validateAutomationStudioTrialEvidenceResult(input);
  if (!answer.ok) return false;
  const result = answer.result;
  return (
    result.verdict === "pass" &&
    result.scope === "full_live_run" &&
    result.provenance === "original" &&
    result.evidenceOrigins.length === 1 &&
    result.evidenceOrigins[0] === "live" &&
    result.liveEpisodeId !== null
  );
}
