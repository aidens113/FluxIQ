// A `replace_unit` repair applied to a copy of the graph that holds its unit
// (state-aware recovery plan, C12): one node, one handler, or one part made
// new, and nothing else touched.
//
// **A node keeps its id.** The first replacement step takes the replaced
// node's id, so every edge that entered the node still enters the unit, the
// units those edges leave are unchanged, and a continuation saved at the node
// re-attempts the unit where it stands. Further steps chain behind it, and the
// last one leaves by the node's own outgoing edges. Its checkpoint and entry
// declarations stay with it, since a Route or an entry names them.
//
// **A handler keeps its id** for the same reason: its registration is named by
// it (`<graph>/<node id>`). Its old body and end go, and the new ones take ids
// derived from the run and the handler.
//
// **A part** is its whole Subflow graph. Its Start stays and leads to the
// first replacement step; every other node is replaced.

import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../model/index.ts";
import { AUTOMATION_STUDIO_HANDLER_DEFINITION_ID, AUTOMATION_STUDIO_SUBFLOW_CONTRACT_KEYS } from "../../nodes/control-flow/index.ts";
import type { AutomationStudioRuntimePatchHandlerSpec, AutomationStudioRuntimePatchStep } from "../llm/index.ts";
import { automationStudioRuntimePatchHandlerGraph } from "./handler-build.ts";
import { automationStudioGraphUnits } from "./unit-digest.ts";

/** A replacement applied, or the plain reason it could not be. */
export type AutomationStudioUnitReplacement =
  | { applied: true; graph: AutomationStudioFlowDocument }
  | { applied: false; reason: string; message: string };

/** The node definition that starts a graph, which a part's replacement keeps. */
const START_DEFINITION_ID = "builtin.control.start";

/** Where a replacement step sits relative to the one before it. */
const STEP_X_OFFSET = 320;

/** The run id as a segment of a derived node id. */
export function automationStudioRuntimePatchIdSegment(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9_.-]/gu, "-");
}

/** A node's replacement: its first step under its id, the rest chained behind, its outgoing edges leaving the last. */
export function replaceAutomationStudioNodeUnit(input: {
  graph: AutomationStudioFlowDocument;
  nodeId: string;
  steps: readonly AutomationStudioRuntimePatchStep[];
  failedEdgeTo?: string;
  runId: string;
  reason: string;
}): AutomationStudioUnitReplacement {
  const next = structuredClone(input.graph);
  const index = next.nodes.findIndex((node) => node.id === input.nodeId);
  const replaced = next.nodes[index];
  if (!replaced) return refused(`target_node_absent:${input.nodeId}`, `Node "${input.nodeId}" is not in this graph.`);
  const units = automationStudioGraphUnits(next);
  if (units.unitOfNode.get(input.nodeId) !== `node:${input.nodeId}`) {
    return refused(`unit_not_a_node:${input.nodeId}`, `"${input.nodeId}" is part of a handler; replace the handler instead.`);
  }
  if (replaced.definitionId === START_DEFINITION_ID) return refused(`unit_not_replaceable:${input.nodeId}`, `"${input.nodeId}" starts the graph and is not replaced by a repair.`);
  const base = `node.runtime-patch.${automationStudioRuntimePatchIdSegment(input.runId)}.unit-${automationStudioRuntimePatchIdSegment(input.nodeId)}`;
  const ids = input.steps.map((_step, position) => (position === 0 ? input.nodeId : `${base}.step-${position + 1}`));
  if (ids.slice(1).some((id) => next.nodes.some((node) => node.id === id))) return refused(`step_node_id_in_use:${input.nodeId}`, `An id the replacement of "${input.nodeId}" would take is already in use.`);
  if (input.failedEdgeTo !== undefined) {
    const target = units.unitOfNode.get(input.failedEdgeTo);
    if (!target || input.failedEdgeTo === input.nodeId || !target.startsWith("node:")) {
      return refused(`failed_edge_target_invalid:${input.failedEdgeTo}`, `A replaced step's failure may go only to another existing step outside any handler, and "${input.failedEdgeTo}" is not one.`);
    }
  }
  const kept = keptContract(replaced.metadata);
  const position = replaced.position;
  const stepNodes = input.steps.map((step, stepIndex): AutomationStudioFlowNode => ({
    id: ids[stepIndex]!,
    definitionId: step.definitionId,
    label: step.label ?? step.definitionId,
    description: input.reason,
    ...(step.parameters ? { parameterValues: structuredClone(step.parameters) } : {}),
    ...(position ? { position: { x: position.x + STEP_X_OFFSET * stepIndex, y: position.y } } : {}),
    metadata: { ...(stepIndex === 0 ? kept : {}), runtimePatchRunId: input.runId, ...(stepIndex === 0 ? { runtimePatchReplacedDefinitionId: replaced.definitionId } : {}) }
  }));
  next.nodes.splice(index, 1, ...stepNodes);
  const last = ids[ids.length - 1]!;
  for (const edge of next.edges) if (edge.sourceNodeId === input.nodeId) edge.sourceNodeId = last;
  for (let position = 0; position + 1 < ids.length; position += 1) {
    next.edges.push({ id: `runtime-patch.${input.runId}.unit-${input.nodeId}.step.${position + 1}`, sourceNodeId: ids[position]!, sourcePortId: "success", targetNodeId: ids[position + 1]!, targetPortId: "in" });
  }
  if (input.failedEdgeTo !== undefined) {
    next.edges = next.edges.filter((edge) => !(edge.sourceNodeId === last && edge.sourcePortId === "failed"));
    next.edges.push({ id: `runtime-patch.${input.runId}.unit-${input.nodeId}.failed`, sourceNodeId: last, sourcePortId: "failed", targetNodeId: input.failedEdgeTo, targetPortId: "in" });
  }
  return { applied: true, graph: next };
}

/** A handler's replacement: the registration under its id, a new body and end, the old body and end gone. */
export function replaceAutomationStudioHandlerUnit(input: {
  graph: AutomationStudioFlowDocument;
  handlerNodeId: string;
  handler: AutomationStudioRuntimePatchHandlerSpec;
  runId: string;
  reason: string;
}): AutomationStudioUnitReplacement {
  const next = structuredClone(input.graph);
  const handler = next.nodes.find((node) => node.id === input.handlerNodeId);
  if (!handler || handler.definitionId !== AUTOMATION_STUDIO_HANDLER_DEFINITION_ID) {
    return refused(`unit_not_a_handler:${input.handlerNodeId}`, `"${input.handlerNodeId}" is not a handler in this graph.`);
  }
  const members = new Set(automationStudioGraphUnits(next).members.get(`handler:${input.handlerNodeId}`) ?? [input.handlerNodeId]);
  const idBase = `node.runtime-patch.${automationStudioRuntimePatchIdSegment(input.runId)}.unit-${automationStudioRuntimePatchIdSegment(input.handlerNodeId)}`;
  const built = automationStudioRuntimePatchHandlerGraph({ spec: input.handler, handlerNodeId: input.handlerNodeId, idBase, runId: input.runId, reason: input.reason, ...(handler.position ? { position: { x: handler.position.x, y: handler.position.y - 240 } } : {}) });
  const remaining = next.nodes.filter((node) => !members.has(node.id));
  if (built.nodes.some((node) => remaining.some((other) => other.id === node.id))) {
    return refused(`step_node_id_in_use:${input.handlerNodeId}`, `An id the replacement of handler "${input.handlerNodeId}" would take is already in use.`);
  }
  // The new handler takes the old one's place in node order, which is the
  // tiebreak among handlers at one level (C4).
  const position = next.nodes.slice(0, next.nodes.indexOf(handler)).filter((node) => !members.has(node.id)).length;
  next.nodes = [...remaining.slice(0, position), ...built.nodes, ...remaining.slice(position)];
  next.edges = [...next.edges.filter((edge) => !members.has(edge.sourceNodeId)), ...built.edges];
  return { applied: true, graph: next };
}

/** A part's replacement: its Start kept and leading to the first step, everything else made new. */
export function replaceAutomationStudioPartUnit(input: {
  graph: AutomationStudioFlowDocument;
  subflowId: string;
  steps: readonly AutomationStudioRuntimePatchStep[];
  runId: string;
  reason: string;
}): AutomationStudioUnitReplacement {
  const next = structuredClone(input.graph);
  const starts = next.nodes.filter((node) => node.definitionId === START_DEFINITION_ID);
  const startEdges = next.edges.filter((edge) => starts.some((start) => start.id === edge.sourceNodeId));
  const base = `node.runtime-patch.${automationStudioRuntimePatchIdSegment(input.runId)}.part-${automationStudioRuntimePatchIdSegment(input.subflowId)}`;
  const ids = input.steps.map((_step, index) => `${base}.step-${index + 1}`);
  if (ids.some((id) => starts.some((start) => start.id === id))) return refused(`step_node_id_in_use:${input.subflowId}`, `An id the replacement of part "${input.subflowId}" would take is already in use.`);
  const origin = starts[0]?.position ?? next.nodes[0]?.position;
  next.nodes = [
    ...starts,
    ...input.steps.map((step, index): AutomationStudioFlowNode => ({
      id: ids[index]!,
      definitionId: step.definitionId,
      label: step.label ?? step.definitionId,
      description: input.reason,
      ...(step.parameters ? { parameterValues: structuredClone(step.parameters) } : {}),
      ...(origin ? { position: { x: origin.x + STEP_X_OFFSET * (index + 1), y: origin.y } } : {}),
      metadata: { runtimePatchRunId: input.runId }
    }))
  ];
  const edges: AutomationStudioFlowEdge[] = starts.map((start, index) => ({
    id: `runtime-patch.${input.runId}.part.start.${index + 1}`,
    sourceNodeId: start.id,
    sourcePortId: startEdges.find((edge) => edge.sourceNodeId === start.id)?.sourcePortId ?? "next",
    targetNodeId: ids[0]!,
    targetPortId: "in"
  }));
  for (let index = 0; index + 1 < ids.length; index += 1) {
    edges.push({ id: `runtime-patch.${input.runId}.part.step.${index + 1}`, sourceNodeId: ids[index]!, sourcePortId: "success", targetNodeId: ids[index + 1]!, targetPortId: "in" });
  }
  next.edges = edges;
  return { applied: true, graph: next };
}

/** The contract declarations a replaced node's first step keeps: the entry and checkpoint a Route or an entry selection names. */
function keptContract(metadata: JsonObject | undefined): JsonObject {
  const kept: JsonObject = {};
  for (const key of [AUTOMATION_STUDIO_SUBFLOW_CONTRACT_KEYS.entry, AUTOMATION_STUDIO_SUBFLOW_CONTRACT_KEYS.checkpoint]) {
    const value = metadata?.[key];
    if (value !== undefined) kept[key] = structuredClone(value);
  }
  return kept;
}

function refused(reason: string, message: string): AutomationStudioUnitReplacement {
  return { applied: false, reason, message };
}
