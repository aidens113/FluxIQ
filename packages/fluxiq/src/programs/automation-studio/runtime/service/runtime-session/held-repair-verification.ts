// What a run whose fixes held is verified against (state-aware recovery plan,
// C6 step 8).
//
// A fix held in the run is overlaid on the run's in-memory graph at the
// failing step, and the run carries on there; nothing re-reads the stored
// Flow. So the graph a held run ran is its starting graph with each kept fix
// on it, and that is the graph its result is judged against: the shape the
// judge is told about, and `resultSummary.flowShape`, describe the run that
// happened. A run that held a fix is also judged as a repaired run, under the
// check the run session re-decided for it (`after_repair`).
//
// Which fixes count is the root trace's to say: `trace.repairs` lists every
// repair whose overlay the run kept, so a fix whose trial failed, and was
// dropped, is not part of the graph. The verification reads one graph, the
// one the run's root frame ran, so the overlay chosen is the last kept one
// made in the root frame: each overlay is made on the graph the frame was
// running, earlier kept fixes included, and a dropped one put that graph back.
// A fix made in a called part's frame changes that part's graph, not this one.

import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import type { AutomationStudioInRunRepairLedgerView, AutomationStudioRunResultCheck } from "../runtime-adaptation/index.ts";

/** The part of a verification request this reads and fills: the run, the graph it is judged against, and the check. */
type HeldRepairVerificationRequest = {
  session: { trace?: { repairs?: string[] | undefined } | undefined };
  flow?: AutomationStudioFlowDocument | undefined;
  resultCheck?: { checked: boolean; epoch: number; code: string; reason: string } | undefined;
};

/**
 * The request unchanged for a run that kept no fix. For one that did: the
 * repaired run's check, when the run has one, and the graph its root frame
 * ran with its kept fixes, when this run's ledger holds that graph for the
 * Flow being verified.
 */
export function automationStudioHeldRepairVerification<T extends HeldRepairVerificationRequest>(input: {
  request: T;
  ledger: AutomationStudioInRunRepairLedgerView | undefined;
  check: AutomationStudioRunResultCheck | null;
}): T {
  const kept = new Set(input.request.session.trace?.repairs ?? []);
  if (!kept.size) return input.request;
  const check = input.check;
  const flow = heldFlow(input.request.flow, input.ledger, kept);
  return {
    ...input.request,
    ...(check ? { resultCheck: { checked: check.checked, epoch: check.epoch, code: check.code, reason: check.reason } } : {}),
    ...(flow ? { flow } : {})
  };
}

/** The Flow with the nodes and edges of the last kept root-frame overlay, or undefined when there is none for this Flow. */
function heldFlow(flow: AutomationStudioFlowDocument | undefined, ledger: AutomationStudioInRunRepairLedgerView | undefined, kept: ReadonlySet<string>): AutomationStudioFlowDocument | undefined {
  if (!flow || !ledger) return undefined;
  const root = ledger.overlays().filter((overlay) => kept.has(overlay.repairId) && overlay.framePath.length <= 1).at(-1);
  if (!root || root.graph.flowId !== flow.flowId) return undefined;
  return { ...flow, nodes: root.graph.nodes, edges: root.graph.edges };
}
