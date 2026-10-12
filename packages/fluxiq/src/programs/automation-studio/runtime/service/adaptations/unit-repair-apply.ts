// Applying a unit repair durably (state-aware recovery plan, C12): the
// `add_handler` or `replace_unit` an in-run repair recorded (C6 step 8),
// written to the saved graph once its run was judged to answer
// (`../runtime-adaptation/judged-promotion.ts`).
//
// Which graph it is written to:
//
// - a node or a handler, and a handler of node or Subflow scope: the Subflow
//   graph the adaptation names, resolved and ownership-checked as every node
//   adaptation's target is (`./patches.ts`);
// - a part: the part's own Subflow graph, replaced whole but for its Start;
// - a handler of automation scope: the automation's `recovery` Subflow graph
//   (C4), created on demand. The created Subflow is a mutation of its own, so
//   a rollback deletes it again.
//
// The writing is `./unit-repair-change.ts`, shared with the candidate a judged
// run ran, with its unit digest guard. The structural gate (a linked review
// record) is the apply's own (`../../recovery/adaptation-promotion.ts`), and
// the saved graph is validated with its Subflow's role before it is written.

import type { JsonObject } from "../../../../../core/index.ts";
import { validateAutomationStudioFlow, type AutomationStudioFlowAdaptation, type AutomationStudioFlowArtifact, type AutomationStudioFlowValidationContext } from "../../../model/index.ts";
import { compactJsonObject } from "../compact-json.ts";
import type { AutomationStudioFacadePorts } from "../facade-ports.ts";
import type { AutomationStudioFlowWriter } from "../flows/index.ts";
import { isJsonRecord } from "../json-values.ts";
import { assertFlowValidationOk, durableAdaptationMutationRecord, type AutomationStudioAdaptationPatches } from "./patches.ts";
import { automationStudioGraphWithUnitRepair, automationStudioIsUnitRepairChange, automationStudioUnitRepairWritesRecoveryGraph } from "./unit-repair-change.ts";

type UnitRepairTarget = { graphFlow: AutomationStudioFlowArtifact; subflowId?: string; validation: AutomationStudioFlowValidationContext; created?: JsonObject };

/** The mutations one unit repair makes, in order: a created recovery Subflow first, when one was needed, then the graph it wrote. */
export async function applyAutomationStudioUnitRepairPatch(input: {
  adaptation: AutomationStudioFlowAdaptation;
  patch: AutomationStudioFlowAdaptation["patch"][number];
  now: number;
  patches: Pick<AutomationStudioAdaptationPatches, "resolveFlowNodeAdaptationTarget">;
  flowWriter: Pick<AutomationStudioFlowWriter, "saveFlowInternal">;
  facade: Pick<AutomationStudioFacadePorts, "getFlow" | "getFlowSubflow" | "createFlowSubflow" | "listFlowSubflowSummaries">;
}): Promise<JsonObject[]> {
  const { adaptation, patch } = input;
  if (!automationStudioIsUnitRepairChange(patch)) throw new Error(`Adaptation patch ${patch.kind} is not a unit repair; ${adaptation.adaptationId} refused.`);
  assertOneRepairUnit(adaptation);
  const target = await unitRepairTarget(input, patch);
  const after = automationStudioGraphWithUnitRepair({ graph: target.graphFlow, adaptation, patch, now: input.now, validationContext: target.validation });
  assertFlowValidationOk(after, "Unit repair adaptation patch", target.validation);
  const saved = await input.flowWriter.saveFlowInternal({ projectId: adaptation.projectId, flow: after, validation: target.validation }, false);
  const written = durableAdaptationMutationRecord({
    patchKind: patch.kind,
    artifactKind: "flow",
    artifactId: saved.flowId,
    targetKind: target.subflowId ? "subflow" : "flow",
    targetId: target.subflowId ?? saved.flowId,
    before: target.graphFlow,
    after: saved,
    validation: validateAutomationStudioFlow(saved, target.validation),
    ...(target.subflowId ? {
      rollback: compactJsonObject({ kind: "restore_owned_subflow_graph", parentFlowId: adaptation.flowId, subflowId: target.subflowId, graphFlowId: saved.flowId })
    } : {})
  });
  return target.created ? [target.created, written] : [written];
}

/**
 * One repair names one unit (C12). An adaptation that carries a unit repair
 * carries nothing else, so it can never change a second unit through a patch
 * beside it.
 */
function assertOneRepairUnit(adaptation: AutomationStudioFlowAdaptation): void {
  if (adaptation.patch.length !== 1) throw new Error(`A unit repair names one unit and changes nothing else, and ${adaptation.adaptationId} carries ${adaptation.patch.length} changes; refused.`);
}

async function unitRepairTarget(
  input: Parameters<typeof applyAutomationStudioUnitRepairPatch>[0],
  patch: AutomationStudioFlowAdaptation["patch"][number]
): Promise<UnitRepairTarget> {
  if (automationStudioUnitRepairWritesRecoveryGraph(patch)) return await recoveryGraph(input);
  const after = isJsonRecord(patch.after) ? patch.after : {};
  const unit = isJsonRecord(after.unit) ? after.unit : undefined;
  const subflowId = patch.kind === "replace_unit" && unit?.kind === "part" && typeof unit.subflowId === "string" ? unit.subflowId : input.adaptation.subflowId;
  return await input.patches.resolveFlowNodeAdaptationTarget({ ...input.adaptation, ...(subflowId ? { subflowId } : {}) });
}

/** The automation's `recovery` Subflow graph, where automation-scoped handlers live (C4); created when the Flow has none. */
async function recoveryGraph(input: Parameters<typeof applyAutomationStudioUnitRepairPatch>[0]): Promise<UnitRepairTarget> {
  const { adaptation } = input;
  const page = await input.facade.listFlowSubflowSummaries({ projectId: adaptation.projectId, flowId: adaptation.flowId, role: "recovery", limit: 1, offset: 0 });
  const listed = page.subflows[0];
  const existing = listed ? await input.facade.getFlowSubflow(adaptation.projectId, adaptation.flowId, listed.subflowId) : null;
  const subflow = existing ?? await input.facade.createFlowSubflow({ projectId: adaptation.projectId, flowId: adaptation.flowId, name: "Recovery", role: "recovery" });
  if (subflow.role !== "recovery") throw new Error(`Subflow ${subflow.subflowId} is not the automation's recovery Subflow; ${adaptation.adaptationId} refused.`);
  const graphFlowId = subflow.graphFlowId?.trim();
  if (!graphFlowId) throw new Error(`The recovery Subflow ${subflow.subflowId} owns no graph; ${adaptation.adaptationId} refused.`);
  const graphFlow = await input.facade.getFlow(adaptation.projectId, graphFlowId);
  const created = existing ? undefined : durableAdaptationMutationRecord({
    patchKind: "add_handler",
    artifactKind: "subflow",
    artifactId: subflow.subflowId,
    targetKind: "subflow",
    targetId: subflow.subflowId,
    before: null,
    after: subflow,
    validation: { ok: true, issues: [] },
    rollback: compactJsonObject({ kind: "delete_created_subflow", artifactKind: "subflow", artifactId: subflow.subflowId, graphFlowId, createdGraphFlow: true })
  });
  return { graphFlow, subflowId: subflow.subflowId, validation: { subflowRole: "recovery" }, ...(created ? { created } : {}) };
}
