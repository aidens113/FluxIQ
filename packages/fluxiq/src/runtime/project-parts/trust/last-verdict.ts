import type { AutomationStudioPartTrustEvidence } from "./types.ts";

/**
 * Where a version stands on its most recent verdict: `failed` when the newest verdict is a
 * failure, `passed` when it is a success, nothing when no run has said. A failure and a success
 * at the same instant read as a failure. A version is offered to a caller that did not choose it
 * only while this is not `failed`, so a later success offers it again.
 */
export function lastAutomationStudioPartVerdict(evidence: readonly AutomationStudioPartTrustEvidence[]): "passed" | "failed" | undefined {
  let latest: { atMs: number; failed: boolean } | undefined;
  for (const entry of evidence) {
    if (entry.result !== "confirmed" && entry.result !== "refuted") continue;
    const failed = entry.result === "refuted";
    if (!latest || entry.atMs > latest.atMs || (entry.atMs === latest.atMs && failed)) latest = { atMs: entry.atMs, failed };
  }
  return latest ? (latest.failed ? "failed" : "passed") : undefined;
}
