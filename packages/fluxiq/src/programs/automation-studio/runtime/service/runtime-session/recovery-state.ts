import type { AutomationStudioFlowRunDetail } from "../../../model/index.ts";

/**
 * Where a failed run's recovery stands, as `metadata.recoveryState` on its run
 * detail. Times are epoch milliseconds; `code` is a closed code, never a
 * message, so nothing a provider or a page said can reach it.
 */
export type AutomationStudioRunRecoveryState =
  | { state: "running"; startedAt: number }
  | { state: "ended"; startedAt: number; endedAt: number }
  | { state: "threw"; startedAt: number; endedAt: number; code: "recovery.threw" };

/** What marking a recovery reaches the service for. */
export type AutomationStudioRunRecoveryStateInput = {
  /** The failed run's detail as its first save wrote it, before any recovery. */
  detail: AutomationStudioFlowRunDetail;
  /** Whether this run has a recovery context at all. Without one nothing is marked. */
  recovering: boolean;
  /** The recovery itself: stage A through stage D, handed the unmarked detail. */
  annotate(detail: AutomationStudioFlowRunDetail): Promise<AutomationStudioFlowRunDetail>;
  saveFlowRunDetail(detail: AutomationStudioFlowRunDetail): Promise<unknown>;
  now?: () => number;
};

/**
 * Runs a failed run's recovery with its progress on the record, and returns
 * the annotated detail for the caller to save.
 *
 * Core saves a failed run before its recovery starts and writes the
 * recovery's record (`metadata.llmGate`, `metadata.recoveryTrace`) only with
 * the recovery's last save. In between, a reader could not tell a recovery
 * still working from one that had died: when the recovery threw, no record was
 * ever written, and the reader waited out its whole bound for one.
 *
 * So a failed run with a recovery context is saved `running` before the
 * recovery starts. The detail that comes back carries `ended`, and the
 * caller's own save of it is what persists that. When the recovery throws, the
 * pre-recovery detail is saved `threw` and the error is rethrown unchanged.
 *
 * Both marker saves are best-effort: a marker that could not be written
 * leaves the reader on the rule it used before markers existed, while failing
 * the recovery over it would lose the recovery itself. A run that did not fail,
 * or has no recovery context, is annotated exactly as before, unmarked.
 */
export async function annotateAutomationStudioRunDetailWithRecoveryState(input: AutomationStudioRunRecoveryStateInput): Promise<AutomationStudioFlowRunDetail> {
  if (!input.recovering || input.detail.summary.status !== "failed") return await input.annotate(input.detail);
  const now = input.now ?? Date.now;
  const startedAt = now();
  await input.saveFlowRunDetail(withRecoveryState(input.detail, { state: "running", startedAt }))
    .catch(/* best-effort: an unwritten marker leaves the reader on its pre-marker rule, and must not stop the recovery */ () => undefined);
  let annotated: AutomationStudioFlowRunDetail;
  try {
    annotated = await input.annotate(input.detail);
  } catch (error) {
    await input.saveFlowRunDetail(withRecoveryState(input.detail, { state: "threw", startedAt, endedAt: now(), code: "recovery.threw" }))
      .catch(/* best-effort: the recovery's own error is what the caller must see */ () => undefined);
    throw error;
  }
  return withRecoveryState(annotated, { state: "ended", startedAt, endedAt: now() });
}

function withRecoveryState(detail: AutomationStudioFlowRunDetail, recoveryState: AutomationStudioRunRecoveryState): AutomationStudioFlowRunDetail {
  return { ...detail, metadata: { ...(detail.metadata ?? {}), recoveryState } };
}
