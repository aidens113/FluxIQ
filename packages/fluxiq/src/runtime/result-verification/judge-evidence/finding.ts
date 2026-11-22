import type { AutomationStudioJudgeEvidenceProjection } from "./project.ts";
import { automationStudioJudgeEvidenceResponse } from "./response.ts";

/** Screened semantic output only. Raw adapter inputs and projector functions never belong to this durable value. */
export type AutomationStudioJudgeEvidenceFinding = { version: 1 } & AutomationStudioJudgeEvidenceProjection;

const KEYS = new Set(["version", "role", "evidence", "missing", "withheld"]);

/** Read a durable finding and rescreen it with today's privacy declaration without calling the domain projector again. */
export function automationStudioJudgeEvidenceFinding(value: unknown, deniedKeys: readonly string[] | undefined): { ok: true; finding: AutomationStudioJudgeEvidenceFinding } | { ok: false; code: "judge_evidence.finding_invalid" | "judge_evidence.denied_keys_missing" } {
  if (deniedKeys === undefined) return { ok: false, code: "judge_evidence.denied_keys_missing" };
  const invalid = () => ({ ok: false as const, code: "judge_evidence.finding_invalid" as const });
  if (typeof value !== "object" || value === null || Array.isArray(value)) return invalid();
  let held: Record<string, unknown>;
  try {
    held = structuredClone(value) as Record<string, unknown>;
  } catch {
    return invalid();
  }
  if (held.version !== 1 || typeof held.withheld !== "boolean" || !Array.isArray(held.missing) || Object.keys(held).some((key) => !KEYS.has(key))) return invalid();
  // A failed/missing projection has no role or finding. It remains an explicit
  // gap across reopen; it must not turn into an empty successful observation.
  if (held.role === undefined && (held.evidence !== undefined || held.missing.length === 0)) return invalid();
  const response = automationStudioJudgeEvidenceResponse({ role: held.role ?? "observation", ...(held.evidence === undefined ? {} : { evidence: held.evidence }), missing: held.missing }, deniedKeys);
  if (response.role === undefined) return invalid();
  return { ok: true, finding: { version: 1, ...(held.role === undefined ? {} : { role: response.role }), ...(response.evidence === undefined ? {} : { evidence: response.evidence }), missing: response.missing, withheld: held.withheld || response.withheld } };
}
