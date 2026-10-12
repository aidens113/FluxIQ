import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import type { AutomationStudioEntryTrace, AutomationStudioLifecycleTrace, AutomationStudioNodeAttemptTrace } from "../contracts.ts";

/**
 * What one graph run's step loop keeps of lifecycle dispatch for its own
 * frame (state-aware recovery plan, C3, C5, C11). Run-wide state -- the
 * registry, the budget, the incidents, the `handler_execution` records -- is
 * the run holder's (`../lifecycle-run/run-state.ts`); this is only what this
 * frame's trace needs.
 *
 * - `arrivals`: how many times the run has arrived at each node in this frame,
 *   so a dispatch names which arrival it fired at.
 * - `pending`: the record of a handler that ran at `start` or `before`,
 *   stamped on the next attempt and then cleared.
 * - `entry`: where the frame began, when its graph declares alternative
 *   entries (`./entry.ts`), stamped on its first attempt and then cleared.
 * - `bodies`: each handler body's saved attempts, with how many of this
 *   frame's attempts came before it, so the trace shows them where they ran.
 * - `bodyAttempts`: how many attempts `bodies` holds, so the next body's
 *   attempt ids number after them.
 * - `overlays`: the graph this frame ran before an in-run repair overlaid a
 *   fix, by incident id, so a trial that fails puts it back (C6 step 8).
 * - `pendingAct`: the identity of the lasting act the node arrived at now
 *   would dispatch, taken before it ran, which the run's completed-act
 *   ledger records once the attempt is done (`./already-done.ts`).
 *
 * What a dispatch could not do is said on the run holder's `problems`, which
 * the root frame's trace carries as `lifecycleNotes`.
 */
export type AutomationStudioStepLifecycleFrame = {
  arrivals: Map<string, number>;
  pending?: AutomationStudioLifecycleTrace;
  entry?: AutomationStudioEntryTrace;
  bodies: Array<{ at: number; attempts: readonly AutomationStudioNodeAttemptTrace[] }>;
  bodyAttempts: number;
  overlays: Map<string, AutomationStudioFlowDocument>;
  pendingAct?: { nodeId: string; key: string };
};

/** A frame's lifecycle bookkeeping with nothing dispatched yet. */
export function automationStudioStepLifecycleFrame(): AutomationStudioStepLifecycleFrame {
  return { arrivals: new Map(), bodies: [], bodyAttempts: 0, overlays: new Map() };
}
