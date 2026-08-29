import type { Edge, EdgeChange, Node, NodeChange } from "@xyflow/react";
import type { JsonObject } from "../../programs/program-api";
import type { AutomationEditorNodeSpec, AutomationFlowNodeData } from "./node-types";

export const automationNodeEditorConnectionRadius = 72;
export const automationNodeEditorReconnectRadius = 22;
export const automationGraphMiddleMousePanButtons = [1];
export const automationGraphFitViewOptions = { padding: 0.25 };
export const automationGraphDeleteKeyCode = ["Backspace", "Delete"];

export function protectRecentlyConnectedEdge(edgeIdsRef: { current: Set<string> }, edgeId: string): void {
  edgeIdsRef.current.add(edgeId);
  window.setTimeout(() => {
    edgeIdsRef.current.delete(edgeId);
  }, 300);
}

export function automationCompositeCallMetadata(spec: AutomationEditorNodeSpec): JsonObject | undefined {
  if (spec.source?.kind !== "composite") return undefined;
  return { "fluxiq.callFlow": { target: { flowId: spec.source.flowId, version: spec.source.version, scope: spec.availability?.kind === "domain" ? { kind: "domain", domainId: spec.availability.domainId } : { kind: "global" } }, inputBindings: spec.inputs.map((port) => ({ targetPortId: port.id, valueKey: port.id })), outputBindings: spec.outputs.filter((port) => port.role !== "error").map((port) => ({ targetPortId: port.id, valueKey: port.id })), errorBindings: spec.outputs.filter((port) => port.role === "error").map((port) => ({ targetPortId: port.id.replace(/^error\./, ""), valueKey: port.id })) } } as JsonObject;
}

export function ignoreProtectedEdgeRemovals(changes: EdgeChange[], protectedEdgeIds: Set<string>): EdgeChange[] {
  return changes.filter((change) => change.type !== "remove" || !protectedEdgeIds.has(change.id));
}

export function flowNodeChangesAreDurable(changes: NodeChange<Node<AutomationFlowNodeData>>[], dragActive: boolean): boolean {
  return changes.some((change) => {
    if (change.type === "select" || change.type === "dimensions") return false;
    if (change.type === "position" && dragActive) return false;
    return true;
  });
}

export function flowEdgeChangesAreDurable(changes: EdgeChange[]): boolean {
  return changes.some((change) => change.type !== "select");
}
/** @deprecated Use flowNodeChangesAreDurable. */
export const policyNodeChangesAreDurable = flowNodeChangesAreDurable;
/** @deprecated Use flowEdgeChangesAreDurable. */
export const policyEdgeChangesAreDurable = flowEdgeChangesAreDurable;
