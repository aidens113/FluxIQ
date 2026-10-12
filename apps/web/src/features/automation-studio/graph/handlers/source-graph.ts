// The two graphs the handler views are read from, reduced to one shape: the
// editor's draft (what the canvas shows, edits included) and a saved Flow
// document (what the Inspector is handed). Reading never changes either. A
// node with no name of its own reads with an empty label, which the views word
// as an unnamed step rather than show an id.

import type { Edge, Node } from "@xyflow/react";
import type { AutomationFlowNodeData } from "../../flow-editor";
import { automationEditorPalette } from "../../flow-editor/node-palette";
import type { HandlerGraph, HandlerGraphEdge, HandlerGraphNode } from "./types";

/** The editor's draft as a handler graph. `identity` names it; the role is unknown unless given. */
export function handlerGraphFromEditor(
  nodes: ReadonlyArray<Node<AutomationFlowNodeData>>,
  edges: readonly Edge[],
  identity: { graphId?: string; name?: string; role?: string } = {}
): HandlerGraph {
  return {
    graphId: identity.graphId ?? "",
    name: identity.name ?? "",
    ...(identity.role ? { role: identity.role } : {}),
    nodes: nodes.map((node): HandlerGraphNode => ({
      id: node.id,
      // A node the editor could name only by its id has no name a person gave it.
      label: node.data.label === node.id ? "" : node.data.label,
      ...(node.data.nodeDefinitionId ? { definitionId: node.data.nodeDefinitionId } : {}),
      parameterValues: record(node.data.parameterValues) ?? {},
      metadata: record(node.data.metadata) ?? {}
    })),
    edges: edges.map((edge): HandlerGraphEdge => ({ id: edge.id, source: edge.source, sourcePort: edge.sourceHandle ?? "", target: edge.target }))
  };
}

/**
 * A saved Flow document (`{ flowId, name, nodes, edges }`, Core's
 * `AutomationStudioFlowArtifact`) as a handler graph, or nothing when it is
 * not one. A node with no label of its own is named by its node definition.
 */
export function handlerGraphFromSavedFlow(flow: unknown, role?: string): HandlerGraph | undefined {
  const document = record(flow);
  if (!document || !Array.isArray(document.nodes) || !Array.isArray(document.edges)) return undefined;
  const nodes: HandlerGraphNode[] = [];
  for (const value of document.nodes) {
    const node = record(value);
    if (!node || typeof node.id !== "string") continue;
    const definitionId = typeof node.definitionId === "string" ? node.definitionId : undefined;
    nodes.push({
      id: node.id,
      label: text(node.label) ?? text(node.description) ?? definitionLabel(definitionId) ?? "",
      ...(definitionId ? { definitionId } : {}),
      parameterValues: record(node.parameterValues) ?? {},
      metadata: record(node.metadata) ?? {}
    });
  }
  const edges: HandlerGraphEdge[] = [];
  for (const [index, value] of document.edges.entries()) {
    const edge = record(value);
    if (!edge) continue;
    const source = text(edge.sourceNodeId) ?? text(edge.source);
    const target = text(edge.targetNodeId) ?? text(edge.target);
    if (!source || !target) continue;
    edges.push({ id: text(edge.id) ?? `${source}-${target}-${index}`, source, sourcePort: text(edge.sourcePortId) ?? text(edge.sourceHandle) ?? "", target });
  }
  return {
    graphId: text(document.flowId) ?? "",
    name: text(document.name) ?? "",
    ...(role ? { role } : {}),
    nodes,
    edges
  };
}

function definitionLabel(definitionId: string | undefined): string | undefined {
  if (!definitionId) return undefined;
  for (const group of automationEditorPalette) {
    const spec = group.nodes.find((node) => node.id === definitionId);
    if (spec) return spec.label;
  }
  return undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
