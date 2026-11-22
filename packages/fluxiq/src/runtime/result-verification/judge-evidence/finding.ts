import type { AutomationStudioJudgeEvidenceProjection } from "./project.ts";
import { automationStudioJudgeEvidenceResponse } from "./response.ts";
import { automationStudioStoredJudgeFinding } from "./stored-finding.ts";

/** Screened semantic output only. Raw adapter inputs and projector functions never belong to this durable value. */
export type AutomationStudioJudgeEvidenceFinding = { version: 1 } & AutomationStudioJudgeEvidenceProjection;

/** Read a durable finding and rescreen it with today's privacy declaration without calling the domain projector again. */
export function automationStudioJudgeEvidenceFinding(value: unknown, deniedKeys: readonly string[] | undefined): { ok: true; finding: AutomationStudioJudgeEvidenceFinding } | { ok: false; code: "judge_evidence.finding_invalid" | "judge_evidence.denied_keys_missing" } {
  if (deniedKeys === undefined) return { ok: false, code: "judge_evidence.denied_keys_missing" };
  const invalid = () => ({ ok: false as const, code: "judge_evidence.finding_invalid" as const });
  const held = automationStudioStoredJudgeFinding(value);
  if (held === undefined) return invalid();
  // A failed/missing projection has no role or finding. It remains an explicit
  // gap across reopen; it must not turn into an empty successful observation.
  if (held.role === undefined && (held.evidence !== undefined || held.missing.length === 0)) return invalid();
  const response = automationStudioJudgeEvidenceResponse({ role: held.role ?? "observation", ...(held.evidence === undefined ? {} : { evidence: held.evidence }), missing: held.missing }, deniedKeys);
  if (response.role === undefined) return invalid();
  return { ok: true, finding: { version: 1, ...(held.role === undefined ? {} : { role: response.role }), ...(response.evidence === undefined ? {} : { evidence: response.evidence }), missing: response.missing, withheld: held.withheld || response.withheld } };
}
