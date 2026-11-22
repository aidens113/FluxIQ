import type { AutomationStudioJudgeEvidenceFinding } from "./finding.ts";
import { automationStudioJudgeEvidenceResponse } from "./response.ts";

const KEYS = new Set(["version", "role", "evidence", "missing", "withheld"]);

/** Private persistence shape only. This grants no current disclosure policy; model copies must use the current-policy reader. */
export function automationStudioStoredJudgeFinding(value: unknown): AutomationStudioJudgeEvidenceFinding | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  let held: Record<string, unknown>;
  try { held = structuredClone(value) as Record<string, unknown>; } catch { return undefined; }
  if (held.version !== 1 || typeof held.withheld !== "boolean" || !Array.isArray(held.missing) || Object.keys(held).some((key) => !KEYS.has(key))) return undefined;
  if (held.role === undefined && (held.evidence !== undefined || held.missing.length === 0)) return undefined;
  // An explicit structural pass checks the universal credential/JSON rules;
  // [] here is not a substituted current domain policy or disclosure approval.
  const response = automationStudioJudgeEvidenceResponse({ role: held.role ?? "observation", ...(held.evidence === undefined ? {} : { evidence: held.evidence }), missing: held.missing }, []);
  if (response.role === undefined) return undefined;
  return { version: 1, ...(held.role === undefined ? {} : { role: response.role }), ...(response.evidence === undefined ? {} : { evidence: response.evidence }), missing: response.missing, withheld: held.withheld || response.withheld };
}
