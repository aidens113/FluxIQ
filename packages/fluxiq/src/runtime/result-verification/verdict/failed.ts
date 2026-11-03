import type { AutomationStudioResultRepairDirective, AutomationStudioResultVerdict, AutomationStudioResultVerdictBasis, AutomationStudioResultVerification } from "../contracts/index.ts";
import { automationStudioResultFailureRecord } from "../core-observation.ts";

/**
 * A verification that fails the run.
 *
 * `repair` reaches only a `does_not_answer`. An `unsure` is a result nobody could
 * judge, so there is nothing to instruct a repair to change, and
 * `recovery/refuted-result/attempt.ts` already refuses to build a repair from one
 * for the same reason -- "a repair planned from it would be a change to a Flow on
 * evidence that nothing was wrong with it".
 */
export function failed(
  verdict: AutomationStudioResultVerdict,
  basis: AutomationStudioResultVerdictBasis,
  code: string,
  reason: string,
  observation: string,
  repair?: AutomationStudioResultRepairDirective
): AutomationStudioResultVerification {
  return {
    schemaVersion: "automation-studio.result-verification.v1",
    verdict,
    basis,
    code,
    reason,
    observation,
    ...(repair ? { repair } : {}),
    failure: automationStudioResultFailureRecord({ verdict, code, observation, ...(repair ? { repair } : {}) })
  };
}
