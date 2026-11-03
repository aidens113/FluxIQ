// Export and re-ingest of trial evidence results (source test T24). A result
// that leaves Core is marked `derived` and keeps its evidence origins; a
// result that comes back in is `derived` whatever its envelope claims. A
// derived result is never a live success and never enters the live-episode
// tally, so editing an exported offline result to claim a live whole run
// cannot create one.

import type { AutomationStudioTrialEvidenceExport, AutomationStudioTrialEvidenceResult, AutomationStudioTrialEvidenceValidation } from "./types.ts";
import { validateAutomationStudioTrialEvidenceResult } from "./validate-trial-evidence-result.ts";

const EXPORT_KIND = "fluxiq.trial-evidence-result";

/** The export envelope of `result`, as an unaliased, derived copy. Throws when `result` does not validate. */
export function exportAutomationStudioTrialEvidenceResult(result: AutomationStudioTrialEvidenceResult): AutomationStudioTrialEvidenceExport {
  const answer = validateAutomationStudioTrialEvidenceResult(result);
  if (!answer.ok) throw new Error(`trial evidence result is invalid: ${answer.issues.map((issue) => issue.code).join(", ")}`);
  const derived: AutomationStudioTrialEvidenceResult = { ...answer.result, provenance: "derived" };
  return { kind: EXPORT_KIND, result: derived };
}

/** Read an export envelope back. The answer's result is always `derived`. */
export function ingestAutomationStudioTrialEvidenceResult(input: unknown): AutomationStudioTrialEvidenceValidation {
  const envelope = typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : undefined;
  if (envelope?.kind !== EXPORT_KIND) {
    return { ok: false, issues: [{ severity: "error", code: "trial_evidence.export_kind_invalid", message: `an ingested trial evidence result must be a ${EXPORT_KIND} envelope`, path: "kind" }] };
  }
  const answer = validateAutomationStudioTrialEvidenceResult(envelope.result);
  if (!answer.ok) return answer;
  const derived: AutomationStudioTrialEvidenceResult = { ...answer.result, provenance: "derived" };
  return { ok: true, result: derived };
}
