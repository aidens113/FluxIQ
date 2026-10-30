import type { JsonObject } from "../../../../../core/index.ts";

/**
 * The latest whole test as a repair's `failingReceipt` names it, when one stands
 * that did not pass or passed only on the run's own recovery (`rescued`); undefined
 * when none does. What `../supervisor/dispatch-tool.ts` offers beside a refusal and
 * now also fills in for a repair that names no receipt (`./defaults.ts`).
 */
export function automationStudioProjectSupervisorWholeTestReceipt(
  /** The latest assembled Flow, when there is one. */
  latest: { revision: number; digest: string } | undefined,
  /** Its latest whole test, when it was tested. */
  standing: { verdict: string; trialRunId?: string | undefined } | undefined,
  rescued: boolean
): JsonObject | undefined {
  return latest && standing && (standing.verdict !== "yes" || rescued) ? { kind: "candidate_trial", receiptId: standing.trialRunId ?? `whole-test-${latest.revision}`, digest: latest.digest } : undefined;
}
