import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioCandidateTrialAct, AutomationStudioCandidateTrialResult, AutomationStudioCandidateTrialVerdict } from "../../flow-bootstrap/candidate/index.ts";
import type { CandidateTrialAsked } from "./asked.ts";
import { isCandidateTrialJsonObject } from "./json-object.ts";

/** Parse verdict data without turning any of its fields into execution proof. */
export function checkedCandidateTrialAnswer(raw: unknown, latest: { revision: number; digest: string }, verdicts: readonly AutomationStudioCandidateTrialVerdict[], readActs: (value: unknown) => AutomationStudioCandidateTrialAct[]): CandidateTrialAsked | string {
  const result = raw as Partial<AutomationStudioCandidateTrialResult> | null;
  if (!result || typeof result !== "object" || Array.isArray(result)
    || !(verdicts as readonly unknown[]).includes(result.verdict)
    || !isCandidateTrialJsonObject(result.feedback) || (result.trialRunId !== undefined && typeof result.trialRunId !== "string")) return "candidate.trial_result_invalid";
  if (result.revision !== latest.revision || result.digest !== latest.digest) return "candidate.trial_result_mismatch";
  const acts = readActs(result.acts);
  const answer: AutomationStudioCandidateTrialResult = { revision: latest.revision, digest: latest.digest, verdict: result.verdict!, feedback: structuredClone(result.feedback) as JsonObject, ...(result.trialRunId ? { trialRunId: result.trialRunId } : {}), ...(acts.length ? { acts } : {}) };
  const standingNo = (result as { standingNo?: unknown }).standingNo;
  return { valid: true, answer, ...(standingNo !== undefined ? { standingNo } : {}) };
}
