import type { AutomationStudioLlmEvidenceEntry } from "../context-window.ts";

/** The newest submission's accepted receipt, copied from evidence rather than inferred from a repeated request. */
export function automationStudioLlmEvidenceLatestCandidateReceipt(evidence: readonly AutomationStudioLlmEvidenceEntry[]): { revision: number; digest: string } | undefined {
  for (let index = evidence.length - 1; index >= 0; index -= 1) {
    const entry = evidence[index]!;
    if (entry.toolId !== "core.submit_candidate") continue;
    const value = entry.value;
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    const { ok, revision, digest } = value;
    if (ok !== true || typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 1) return undefined;
    if (typeof digest !== "string" || !/^[0-9a-f]{64}$/u.test(digest)) return undefined;
    return { revision, digest };
  }
  return undefined;
}
