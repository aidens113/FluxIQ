import type { AutomationStudioResultRequestedOutput, AutomationStudioResultVerification, AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { automationStudioResultFailureRecord } from "../core-observation.ts";
import { AUTOMATION_STUDIO_RESULT_VERDICT_CODES, automationStudioResultObservation } from "../verdict/index.ts";
import { automationStudioResultRequestedOutputMissing } from "./missing.ts";

/**
 * `verification` as it stands, or, where it is a yes and the run stored none
 * of the records `owed` names (`./missing.ts`), that yes held (`./index.ts`):
 * `unsure` on the model's basis, so it fails a finished run and promotes no
 * trial, with Core's finding (`requestedOutputMissing`) and its sentence as
 * the reason. What the yes compared and the calls it took are kept.
 */
export function automationStudioResultRequestedOutputHeld(
  verification: AutomationStudioResultVerification,
  summary: AutomationStudioRunResultSummary,
  owed: AutomationStudioResultRequestedOutput | undefined
): AutomationStudioResultVerification {
  if (verification.verdict !== "answers") return verification;
  const missing = automationStudioResultRequestedOutputMissing(summary, owed);
  if (!missing) return verification;
  const code = AUTOMATION_STUDIO_RESULT_VERDICT_CODES.requestedOutputMissing;
  const observation = automationStudioResultObservation(summary);
  return {
    schemaVersion: "automation-studio.result-verification.v1",
    verdict: "unsure",
    basis: "model",
    code,
    reason: `The result was judged to answer the request, and Core held that judgement: ${missing.said}`,
    observation,
    ...(verification.verdicts ? { verdicts: [...verification.verdicts] } : {}),
    ...(verification.calls !== undefined ? { calls: verification.calls } : {}),
    ...(verification.answeredReading ? { answeredReading: { ...verification.answeredReading } } : {}),
    requestedOutputMissing: missing,
    failure: automationStudioResultFailureRecord({ verdict: "unsure", code, observation })
  };
}
