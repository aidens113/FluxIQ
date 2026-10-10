// A unit repair written onto one graph, in memory (state-aware recovery plan,
// C12): an `add_handler` or `replace_unit` change, through the overlay the
// run's in-run repair used (`../../live-patch/overlay.ts`), so the graph a
// judged run ran and the graph an apply saves cannot disagree.
//
// Two guards hold a saved repair to its unit, as the plan requires:
//
// - the unit digest: a replaced unit records the digest it had when the repair
//   was made, and a saved unit that no longer has it is refused rather than
//   overwritten (someone edited it since);
// - one unit: the overlay refuses any change to a unit other than the one the
//   repair names, by the digest of every unit of the graph.
//
// A handler of automation scope (C4) is written into the graph it is handed,
// which the applier makes the automation's `recovery` Subflow graph
// (`./unit-repair-apply.ts`); it is built as a Subflow-scoped handler and then
// given its own scope, which the Flow validator accepts only in that graph.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowAdaptation, AutomationStudioFlowDocument, AutomationStudioUnitRepairChangeKind } from "../../../model/index.ts";
import { automationStudioRepairUnitDigest, overlayAutomationStudioRuntimePatch, type AutomationStudioOverlayValidationContext } from "../../live-patch/index.ts";
import type { AutomationStudioRuntimePatch } from "../../llm/index.ts";
import { isJsonRecord } from "../json-values.ts";

type UnitRepairChange = AutomationStudioFlowAdaptation["patch"][number] & { kind: AutomationStudioUnitRepairChangeKind };

/** What a repair is written onto: a saved graph Flow, or a graph document a run executes. */
type UnitRepairGraph = Pick<AutomationStudioFlowDocument, "schemaVersion" | "flowId" | "name" | "nodes" | "edges" | "createdAt" | "updatedAt"> & { metadata?: JsonObject | undefined };

/** Whether a change is a unit repair, which only the unit repair applier writes. */
export function automationStudioIsUnitRepairChange(patch: AutomationStudioFlowAdaptation["patch"][number]): patch is UnitRepairChange {
  return patch.kind === "add_handler" || patch.kind === "replace_unit";
}

/**
 * Whether a unit repair is written to a graph other than the one its
 * adaptation's Subflow names: a handler of automation scope, which lives in the
 * automation's `recovery` Subflow graph (C4). A candidate for the run's own
 * graph leaves it out; its apply finds the recovery graph itself.
 */
export function automationStudioUnitRepairWritesRecoveryGraph(patch: AutomationStudioFlowAdaptation["patch"][number]): boolean {
  return patch.kind === "add_handler" && isJsonRecord(patch.after) && isJsonRecord(patch.after.scope) && patch.after.scope.kind === "automation";
}

/**
 * `graph` with the repair written onto it; for a part, `graph` is the part's
 * own graph and comes back replaced. Throws, naming why, when the repair cannot
 * be written, its unit changed since, or it would change another unit.
 */
export function automationStudioGraphWithUnitRepair<TGraph extends UnitRepairGraph>(input: {
  graph: TGraph;
  adaptation: Pick<AutomationStudioFlowAdaptation, "adaptationId" | "sourceRunId">;
  patch: UnitRepairChange;
  now: number;
  validationContext?: AutomationStudioOverlayValidationContext | undefined;
}): TGraph {
  const { graph, adaptation, patch } = input;
  const refused = (why: string): Error => new Error(`Adaptation patch ${patch.kind} ${why}; ${adaptation.adaptationId} refused.`);
  const after = isJsonRecord(patch.after) ? patch.after : undefined;
  if (!after || !patch.targetId) throw refused("does not carry its repair and the unit it names");
  const automationScope = patch.kind === "add_handler" && isJsonRecord(after.scope) && after.scope.kind === "automation";
  const runtime = { ...after, ...(automationScope ? { scope: { kind: "subflow", inherit: true } } : {}), kind: patch.kind, reason: patch.summary } as unknown as AutomationStudioRuntimePatch;
  const part = runtime.kind === "replace_unit" && runtime.unit.kind === "part" ? runtime.unit.subflowId : undefined;
  if (runtime.kind === "replace_unit") {
    if (!isJsonRecord(after.unit)) throw refused("does not name the unit it replaces");
    const unitId = runtime.unit.kind === "part" ? runtime.unit.subflowId : runtime.unit.nodeId;
    if (unitId !== patch.targetId) throw refused(`names two units (${patch.targetId} and ${unitId})`);
    const recorded = isJsonRecord(patch.before) && typeof patch.before.unitDigest === "string" ? patch.before.unitDigest : undefined;
    if (!recorded) throw refused("does not record the digest of the unit it replaced");
    if (automationStudioRepairUnitDigest(graph, runtime.unit) !== recorded) throw refused(`names a unit (${patch.targetId}) that changed since the repair was made`);
  }
  const document = documentOf(graph);
  const overlay = overlayAutomationStudioRuntimePatch({
    flow: document,
    patch: runtime,
    failedNodeId: patch.targetId,
    runId: adaptation.sourceRunId ?? adaptation.adaptationId,
    ...(part ? { subflowGraphs: { [part]: document } } : {}),
    ...(input.validationContext ? { validationContext: input.validationContext } : {})
  });
  if (!overlay.applied) throw refused(`could not be written (${overlay.reason}): ${overlay.message}`);
  const written = overlay.partGraph ?? overlay.flow;
  const nodes = automationScope && overlay.changedUnit.kind === "handler" ? withAutomationScope(written.nodes, overlay.changedUnit.nodeId) : written.nodes;
  return { ...graph, nodes, edges: written.edges, updatedAt: input.now };
}

/** The graph as the overlay reads it: its nodes and edges are what a repair changes and what its guards compare. */
function documentOf(graph: UnitRepairGraph): AutomationStudioFlowDocument {
  return {
    schemaVersion: graph.schemaVersion,
    flowId: graph.flowId,
    ownerKind: "policy",
    ownerId: graph.flowId,
    name: graph.name,
    nodes: graph.nodes,
    edges: graph.edges,
    createdAt: graph.createdAt,
    updatedAt: graph.updatedAt,
    ...(graph.metadata ? { metadata: graph.metadata } : {})
  };
}

/** The handler node given its declared automation scope (C4). */
function withAutomationScope(nodes: AutomationStudioFlowDocument["nodes"], handlerNodeId: string): AutomationStudioFlowDocument["nodes"] {
  return nodes.map((node) => node.id === handlerNodeId
    ? { ...node, parameterValues: { ...(node.parameterValues ?? {}), scope: { kind: "automation" } as JsonObject } }
    : node);
}
