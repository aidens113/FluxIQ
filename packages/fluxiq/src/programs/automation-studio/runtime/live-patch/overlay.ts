// The one place a runtime patch is applied to a graph: a pure overlay on a copy
// of the run's in-memory Flow, or a plain refusal (state-aware recovery plan,
// C6 step 8 and C12).
//
// Every patch kind passes through here: the trial of a detached repair
// (`../live-patch.ts`), and the in-run repair that holds the run at its failing
// step and re-attempts the unit it fixed. The input is never changed. Each
// overlay names the unit it changed, and is refused when
//
// - the patch cannot be applied as written (its node is absent, an id it would
//   take is taken, the kind has no application);
// - it changed any unit other than the one it names, by the digest of each
//   unit of the compiled graph (`./unit-digest.ts`); or
// - the graph it produced has an error the Flow validator reports, handler
//   checks included, that the graph it started from did not
//   (`./overlay-validation.ts`).

import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "../../model/index.ts";
import { actionTargetParameterValues } from "../flow-change/index.ts";
import type { AutomationStudioRuntimePatch, AutomationStudioRuntimePatchUnit } from "../llm/index.ts";
import { automationStudioRuntimePatchHandlerGraph } from "./handler-build.ts";
import { automationStudioOverlayValidationRefusal, type AutomationStudioOverlayValidationContext } from "./overlay-validation.ts";
import { applyAutomationStudioInsertedSteps, automationStudioInsertedStepNodeId } from "./step-insert.ts";
import { automationStudioGraphUnits, automationStudioUnitDigestRefusal, type AutomationStudioGraphUnitKey } from "./unit-digest.ts";
import { automationStudioRuntimePatchIdSegment, replaceAutomationStudioHandlerUnit, replaceAutomationStudioNodeUnit, replaceAutomationStudioPartUnit } from "./unit-replace.ts";

export type AutomationStudioRuntimePatchOverlayInput = {
  /** The graph the run is executing: the Flow, or the Subflow graph its failing frame runs. */
  flow: AutomationStudioFlowDocument;
  patch: AutomationStudioRuntimePatch;
  /** The node the run failed at, which a new handler is named and placed after. */
  failedNodeId: string;
  runId: string;
  /** The Subflow graphs a part replacement may name, by Subflow id. */
  subflowGraphs?: Readonly<Record<string, AutomationStudioFlowDocument>>;
  /** What the validator cannot read off the graph: its Subflow's role, and the checkpoints of the graphs that call it. */
  validationContext?: AutomationStudioOverlayValidationContext;
};

/**
 * The overlaid Flow and the unit it changed, with the part's new graph when
 * the unit is a part (the Flow itself is then returned unchanged); or why not,
 * as a reason code the trial receipt records and a sentence a person can read.
 */
export type AutomationStudioRuntimePatchOverlay =
  | { applied: true; flow: AutomationStudioFlowDocument; changedUnit: AutomationStudioRuntimePatchUnit; partGraph?: AutomationStudioFlowDocument }
  | { applied: false; reason: string; message: string };

/** One kind's application, before the guard and the validator have looked at it. */
type Applied =
  | { applied: true; flow: AutomationStudioFlowDocument; changedUnit: AutomationStudioRuntimePatchUnit; aliases?: ReadonlyMap<string, string>; partGraph?: { before: AutomationStudioFlowDocument; after: AutomationStudioFlowDocument } }
  | { applied: false; reason: string; message: string };

/** The patch overlaid on a copy of the run's graph, or the plain reason it was refused. */
export function overlayAutomationStudioRuntimePatch(input: AutomationStudioRuntimePatchOverlayInput): AutomationStudioRuntimePatchOverlay {
  const applied = applyPatch(input);
  if (!applied.applied) return applied;
  if (!applied.partGraph) {
    const named = unitKey(input.flow, applied.changedUnit);
    const changed = automationStudioUnitDigestRefusal({ before: input.flow, after: applied.flow, unit: named, ...(applied.aliases ? { aliases: applied.aliases } : {}) });
    if (changed) return refused(`unit_outside_patch_changed:${changed}`, `The repair names ${describeUnit(applied.changedUnit)} but would also change ${changed.replace(":", " ")}.`);
  }
  const graphs = applied.partGraph ? applied.partGraph : { before: input.flow, after: applied.flow };
  const invalid = automationStudioOverlayValidationRefusal(graphs.before, graphs.after, input.validationContext);
  if (invalid) return refused(`overlay_invalid:${invalid.code}`, invalid.message);
  return {
    applied: true,
    flow: applied.flow,
    changedUnit: applied.changedUnit,
    ...(applied.partGraph ? { partGraph: applied.partGraph.after } : {})
  };
}

/**
 * Each kind's application. The switch is exhaustive by construction: a new
 * patch kind fails the type check in `unappliedRuntimePatchKind` until it is
 * either applied here or explicitly refused.
 */
function applyPatch(input: AutomationStudioRuntimePatchOverlayInput): Applied {
  const { flow, patch, runId } = input;
  switch (patch.kind) {
    case "temporary_wait_retry": {
      const next = structuredClone(flow);
      const node = next.nodes.find((candidate) => candidate.id === patch.targetNodeId);
      if (!node) return refused(`target_node_absent:${patch.targetNodeId}`, `Node "${patch.targetNodeId}" is not in this graph.`);
      node.parameterValues = { ...(node.parameterValues ?? {}), ...(patch.timeoutMs !== undefined ? { timeoutMs: patch.timeoutMs } : {}), ...(patch.retryCount !== undefined ? { retryCount: patch.retryCount } : {}) };
      return { applied: true, flow: next, changedUnit: unitOfNode(flow, patch.targetNodeId) };
    }
    case "temporary_target_override": {
      const next = structuredClone(flow);
      const node = next.nodes.find((candidate) => candidate.id === patch.targetNodeId);
      if (!node) return refused(`target_node_absent:${patch.targetNodeId}`, `Node "${patch.targetNodeId}" is not in this graph.`);
      // Written where an apply would write it, so the trial runs the repair a
      // recorded step would dispatch, not the target it was recorded with.
      const parameterValues = node.parameterValues ?? {};
      let written: JsonObject;
      try {
        written = actionTargetParameterValues({ nodeId: node.id, definitionId: node.definitionId, parameterValues }, patch.target, `the runtime patch of run ${runId}`);
      } catch {
        return refused(`action_target_unwritable:${node.id}`, `The new target could not be written into node "${node.id}".`);
      }
      node.parameterValues = { ...parameterValues, ...written };
      return { applied: true, flow: next, changedUnit: unitOfNode(flow, patch.targetNodeId) };
    }
    case "temporary_reroute": {
      if (!flow.nodes.some((node) => node.id === patch.fromNodeId) || !flow.nodes.some((node) => node.id === patch.toNodeId)) {
        return refused(`reroute_node_absent:${patch.fromNodeId}->${patch.toNodeId}`, `A reroute needs both "${patch.fromNodeId}" and "${patch.toNodeId}" in this graph.`);
      }
      const next = structuredClone(flow);
      if (!next.edges.some((edge) => edge.sourceNodeId === patch.fromNodeId && edge.targetNodeId === patch.toNodeId && edge.sourcePortId === "success")) {
        next.edges.push({ id: `runtime-patch.${patch.fromNodeId}.${patch.toNodeId}`, sourceNodeId: patch.fromNodeId, sourcePortId: "success", targetNodeId: patch.toNodeId, targetPortId: "in" });
      }
      return { applied: true, flow: next, changedUnit: unitOfNode(flow, patch.fromNodeId) };
    }
    // The steps the Flow never had, inserted ahead of the node they must run
    // before (`./step-insert.ts`). The edges that entered that node now enter
    // the first step, which the guard reads as the node itself.
    case "temporary_action_sequence": {
      const inserted = applyAutomationStudioInsertedSteps(flow, patch, runId);
      if (!inserted.applied) return refused(inserted.reason, `The steps could not be inserted before "${patch.targetNodeId}".`);
      return { applied: true, flow: inserted.flow, changedUnit: unitOfNode(flow, patch.targetNodeId), aliases: new Map([[automationStudioInsertedStepNodeId(runId, 0), patch.targetNodeId]]) };
    }
    // No application exists for this kind. Refusing it here is what stops a
    // trial from validating the unmodified Flow.
    case "temporary_recovery_subflow_call":
      return refused(`unapplied_patch_kind:${patch.kind}`, "A recovery Subflow call has no application to a graph.");
    case "add_handler":
      return addHandler(input, patch);
    case "replace_unit":
      return replaceUnit(input, patch);
    default:
      return unappliedRuntimePatchKind(patch);
  }
}

// Compile-time exhaustiveness: a new runtime patch kind fails the type check
// here until it is applied or explicitly refused above.
function unappliedRuntimePatchKind(patch: never): Applied {
  const kind = (patch as { kind?: string }).kind ?? "unknown";
  return refused(`unapplied_patch_kind:${kind}`, `Patch kind ${kind} has no application to a graph.`);
}

/** A new handler, named after the run and the step it was written at, and drawn beside that step. */
function addHandler(input: AutomationStudioRuntimePatchOverlayInput, patch: Extract<AutomationStudioRuntimePatch, { kind: "add_handler" }>): Applied {
  const { flow } = input;
  if (patch.scope.kind === "nodes") {
    const absent = patch.scope.nodeIds.find((id) => !flow.nodes.some((node) => node.id === id));
    if (absent !== undefined) return refused(`handler_scope_node_absent:${absent}`, `The handler names node "${absent}", which is not in this graph.`);
  }
  const base = `node.runtime-patch.${automationStudioRuntimePatchIdSegment(input.runId)}.handler-${automationStudioRuntimePatchIdSegment(input.failedNodeId)}`;
  const taken = new Set([...flow.nodes.map((node) => node.id), ...flow.edges.map((edge) => edge.id)]);
  const position = flow.nodes.find((node) => node.id === input.failedNodeId)?.position;
  for (let attempt = 1; attempt <= MAX_HANDLER_ID_ATTEMPTS; attempt += 1) {
    const id = attempt === 1 ? base : `${base}-${attempt}`;
    const built = automationStudioRuntimePatchHandlerGraph({ spec: patch, handlerNodeId: id, idBase: id, runId: input.runId, reason: patch.reason, ...(position ? { position } : {}) });
    if ([...built.nodes.map((node) => node.id), ...built.edges.map((edge) => edge.id)].some((candidate) => taken.has(candidate))) continue;
    const next = structuredClone(flow);
    next.nodes.push(...built.nodes);
    next.edges.push(...built.edges);
    return { applied: true, flow: next, changedUnit: { kind: "handler", nodeId: id } };
  }
  return refused(`handler_id_in_use:${input.failedNodeId}`, `Every id a new handler for "${input.failedNodeId}" could take is already in use.`);
}

/** How many suffixed ids a new handler tries before it is refused: one run adds a handful of handlers, never this many. */
const MAX_HANDLER_ID_ATTEMPTS = 100;

function replaceUnit(input: AutomationStudioRuntimePatchOverlayInput, patch: Extract<AutomationStudioRuntimePatch, { kind: "replace_unit" }>): Applied {
  const { flow, runId } = input;
  const unit = patch.unit;
  if (unit.kind === "handler") {
    if (!patch.handler) return refused(`replacement_missing:${unit.nodeId}`, "A handler is replaced by a handler, and none was given.");
    const replaced = replaceAutomationStudioHandlerUnit({ graph: flow, handlerNodeId: unit.nodeId, handler: patch.handler, runId, reason: patch.reason });
    return replaced.applied ? { applied: true, flow: replaced.graph, changedUnit: unit } : replaced;
  }
  if (!patch.steps?.length) return refused(`replacement_missing:${unit.kind === "node" ? unit.nodeId : unit.subflowId}`, `A ${unit.kind} is replaced by steps, and none were given.`);
  if (unit.kind === "node") {
    const replaced = replaceAutomationStudioNodeUnit({ graph: flow, nodeId: unit.nodeId, steps: patch.steps, ...(patch.failedEdgeTo !== undefined ? { failedEdgeTo: patch.failedEdgeTo } : {}), runId, reason: patch.reason });
    return replaced.applied ? { applied: true, flow: replaced.graph, changedUnit: unit } : replaced;
  }
  if (patch.failedEdgeTo !== undefined) return refused(`failed_edge_on_part:${unit.subflowId}`, "Only a replaced step may name where its failure goes.");
  const part = input.subflowGraphs?.[unit.subflowId];
  if (!part) return refused(`part_graph_absent:${unit.subflowId}`, `The graph of part "${unit.subflowId}" was not given, so it cannot be replaced.`);
  const replaced = replaceAutomationStudioPartUnit({ graph: part, subflowId: unit.subflowId, steps: patch.steps, runId, reason: patch.reason });
  return replaced.applied ? { applied: true, flow: structuredClone(flow), changedUnit: unit, partGraph: { before: part, after: replaced.graph } } : replaced;
}

/** The unit a node belongs to: the handler whose body holds it, or the node itself. */
function unitOfNode(graph: AutomationStudioFlowDocument, nodeId: string): AutomationStudioRuntimePatchUnit {
  const key = automationStudioGraphUnits(graph).unitOfNode.get(nodeId);
  return key?.startsWith("handler:") ? { kind: "handler", nodeId: key.slice("handler:".length) } : { kind: "node", nodeId };
}

function unitKey(graph: AutomationStudioFlowDocument, unit: AutomationStudioRuntimePatchUnit): AutomationStudioGraphUnitKey {
  if (unit.kind === "handler") return `handler:${unit.nodeId}`;
  if (unit.kind === "node") return automationStudioGraphUnits(graph).unitOfNode.get(unit.nodeId) ?? `node:${unit.nodeId}`;
  return `node:${unit.subflowId}`;
}

function describeUnit(unit: AutomationStudioRuntimePatchUnit): string {
  return unit.kind === "part" ? `part ${unit.subflowId}` : `${unit.kind} ${unit.nodeId}`;
}

function refused(reason: string, message: string): { applied: false; reason: string; message: string } {
  return { applied: false, reason, message };
}
