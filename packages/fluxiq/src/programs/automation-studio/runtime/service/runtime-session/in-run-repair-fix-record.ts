// How a fix the run holds in place is recorded for its judged end: its review
// record when it is structural, its adaptation, and the promotion gate's
// decision, answered as the receipt the run's ledger keeps. One recorder for
// both fixes a run holds: a repair at a failing step (`./in-run-repair.ts`)
// and a handler learned from a layer the defence closed
// (`./interruption-learning.ts`, t516).

import { createHash } from "node:crypto";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioInRunRepairPreparation } from "../../live-patch.ts";
import type { AutomationStudioRuntimeRecoveryPorts } from "../../recovery/index.ts";
import { compactJsonObject } from "../compact-json.ts";
import { isJsonRecord } from "../json-values.ts";
import type { AutomationStudioRuntimeAdaptationContext } from "../runtime-adaptation/index.ts";

/** Saves one fix's review record and adaptation, asks the promotion gate, and answers its receipt: `base` first, then what was recorded. */
export async function recordAutomationStudioInRunFix(input: {
  ports: Pick<AutomationStudioRuntimeRecoveryPorts, "saveFlowChangeProposal" | "saveFlowAdaptation" | "promoteRuntimeAdaptation">;
  context: AutomationStudioRuntimeAdaptationContext;
  base: JsonObject;
  prepared: Extract<AutomationStudioInRunRepairPreparation, { ok: true }>;
  /** What the run's repairs had spent, for a receipt of a fix a model was asked for. */
  spent?: JsonObject | undefined;
}): Promise<JsonObject> {
  // Several patches can share a wall-clock millisecond. Scope their identity
  // to the repair and patch, with a fixed-size digest instead of page words.
  const adaptationId = `adaptation.${createHash("sha256").update(JSON.stringify([input.base.repairId, input.prepared.patch])).digest("hex")}`;
  const proposalId = `proposal.${adaptationId}`;
  const prepared = {
    ...input.prepared,
    adaptation: { ...input.prepared.adaptation, adaptationId, ...(input.prepared.changeProposal ? { proposalId } : {}) },
    ...(input.prepared.changeProposal ? { changeProposal: { ...input.prepared.changeProposal, proposalId, sourceAdaptationId: adaptationId } } : {})
  };
  if (prepared.changeProposal) await input.ports.saveFlowChangeProposal(prepared.changeProposal);
  const saved = await input.ports.saveFlowAdaptation(prepared.adaptation);
  const promoted = await input.ports.promoteRuntimeAdaptation({ adaptation: saved, context: input.context });
  const approvalDecision = isJsonRecord(promoted.metadata?.approvalDecision) ? promoted.metadata.approvalDecision : undefined;
  return compactJsonObject({
    ...input.base,
    outcome: "overlaid",
    kind: prepared.patch.kind,
    changedUnit: prepared.overlay.changedUnit as unknown as JsonObject,
    adaptationId: promoted.adaptationId,
    changeProposalId: prepared.changeProposal?.proposalId,
    approvalDecision,
    // The executor takes the unit again itself, or the run goes on past it; the detached retry never does on this fix's account.
    retryOriginalAction: false,
    ...(input.spent ?? {})
  });
}
