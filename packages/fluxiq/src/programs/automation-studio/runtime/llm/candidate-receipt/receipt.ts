import type { AutomationStudioLlmEvidenceEntry } from "../context-window.ts";

/**
 * The receipt of the latest accepted submission, copied from evidence rather
 * than inferred from a repeated request.
 *
 * A refused submission is no revision, so it is passed over: the accepted one
 * before it is still the current Flow. Live run `run-mv6i27oi-a87fb247` (D2):
 * revision 1 was accepted and judged no, the next submission was refused, and
 * the notes this feeds said "No candidate has been accepted". A newer accepted
 * submission whose receipt is malformed is never walked past: nothing is
 * invented, and an older receipt is not the current one.
 */
export function automationStudioLlmEvidenceLatestCandidateReceipt(evidence: readonly AutomationStudioLlmEvidenceEntry[]): { revision: number; digest: string } | undefined {
  for (let index = evidence.length - 1; index >= 0; index -= 1) {
    const entry = evidence[index]!;
    if (entry.toolId !== "core.submit_candidate") continue;
    const value = entry.value;
    if (typeof value !== "object" || value === null || Array.isArray(value) || value.ok !== true) continue;
    const { revision, digest } = value;
    if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 1) return undefined;
    if (typeof digest !== "string" || !/^[0-9a-f]{64}$/u.test(digest)) return undefined;
    return { revision, digest };
  }
  return undefined;
}
