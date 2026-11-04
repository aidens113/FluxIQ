// What a proposed change does to a Flow's steps, read from what Core already
// holds: the proposal's topology beside the graphs the Flow has now. A turn
// names the proposal (`automationStudioFlowGraphDiffAttachment`) and nothing is
// stored twice, so the picture is always of the proposal itself.
//
// An applied proposal has already become the Flow, so its earlier graph is gone:
// the steps it kept read as unchanged and only what it added is shown. A proposal
// that makes a new part has no earlier graph to read.
//
// Words for a person, never a definition id: the panel draws `label` and `detail`.

import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../flows/executable/graph/flow/index.ts";
import type { AutomationStudioBootstrapAdaptation } from "../../flow-authoring/bootstrap/index.ts";

/** The attachment kind that names a proposed change to a Flow's steps. */
export const AUTOMATION_STUDIO_FLOW_GRAPH_DIFF_ATTACHMENT = "flow-graph-diff";

/** Past this a kind of change is counted, not listed: the panel draws at most 50 rows of each. */
const MAX_ENTRIES = 50;
const MAX_TEXT = 300;
const SEPARATOR = ":";

export type AutomationStudioFlowGraphDiffEntry = { id: string; label: string; detail: string | null };

export type AutomationStudioFlowGraphDiff = {
  flowId: string | null;
  added: AutomationStudioFlowGraphDiffEntry[];
  removed: AutomationStudioFlowGraphDiffEntry[];
  changed: AutomationStudioFlowGraphDiffEntry[];
};

type Graph = { nodes: readonly AutomationStudioFlowNode[]; edges: readonly AutomationStudioFlowEdge[] };

/** What the diff reads. Both are the service's own methods. */
export type AutomationStudioFlowGraphDiffReads = {
  getFlowBootstrapAdaptation(projectId: string, flowId: string, adaptationId: string): Promise<AutomationStudioBootstrapAdaptation | null>;
  getFlow(projectId: string, flowId: string): Promise<Graph>;
};

/** The attachment a turn carries to show this proposal. */
export function automationStudioFlowGraphDiffAttachment(flowId: string, adaptationId: string): { kind: string; ref: string } {
  return { kind: AUTOMATION_STUDIO_FLOW_GRAPH_DIFF_ATTACHMENT, ref: `${flowId}${SEPARATOR}${adaptationId}` };
}

/** Reads a reference's proposal and says what it does. Throws when the reference names nothing readable. */
export async function automationStudioFlowGraphDiff(reads: AutomationStudioFlowGraphDiffReads, projectId: string, ref: string): Promise<AutomationStudioFlowGraphDiff> {
  const split = ref.indexOf(SEPARATOR);
  const adaptation = split > 0 ? await reads.getFlowBootstrapAdaptation(projectId, ref.slice(0, split), ref.slice(split + 1)) : null;
  if (!adaptation) throw new Error("That proposed change is no longer held.");
  const parts = adaptation.topology.subflows;
  const diff: Record<"added" | "removed" | "changed", AutomationStudioFlowGraphDiffEntry[]> = { added: [], removed: [], changed: [] };
  for (const part of parts) {
    const before = await earlierGraph(reads, adaptation, projectId, part.graphFlow);
    collect(diff, before, part.graphFlow, parts.length > 1 ? `${part.subflow.name}: ` : "");
  }
  return { flowId: null, added: bounded(diff.added), removed: bounded(diff.removed), changed: bounded(diff.changed) };
}

async function earlierGraph(reads: AutomationStudioFlowGraphDiffReads, adaptation: AutomationStudioBootstrapAdaptation, projectId: string, after: Graph & { flowId: string }): Promise<Graph> {
  const existing = adaptation.existingIds;
  if (existing?.graphFlowId !== after.flowId) return { nodes: [], edges: [] };
  if (adaptation.status !== "applied") return await reads.getFlow(projectId, after.flowId);
  const kept = new Set(Object.values(existing.nodeIdByKey ?? {}));
  const nodes = after.nodes.filter((node) => kept.has(node.id));
  const present = new Set(nodes.map((node) => node.id));
  return { nodes, edges: after.edges.filter((edge) => present.has(edge.sourceNodeId) && present.has(edge.targetNodeId)) };
}

function collect(diff: Record<"added" | "removed" | "changed", AutomationStudioFlowGraphDiffEntry[]>, before: Graph, after: Graph, where: string): void {
  const names = new Map([...before.nodes, ...after.nodes].map((node) => [node.id, nodeName(node)]));
  compare(diff, before.nodes, after.nodes, nodeShape, (node) => ({ id: node.id, label: bound(`${where}${nodeName(node)}`), detail: null }));
  compare(diff, before.edges, after.edges, edgeShape, (edge) => ({
    id: edge.id,
    label: bound(`${where}${names.get(edge.sourceNodeId) ?? "A step"} to ${names.get(edge.targetNodeId) ?? "a step"}`),
    detail: "Connection"
  }));
}

function compare<T extends { id: string }>(diff: Record<"added" | "removed" | "changed", AutomationStudioFlowGraphDiffEntry[]>, before: readonly T[], after: readonly T[], shape: (value: T) => string, entry: (value: T) => AutomationStudioFlowGraphDiffEntry): void {
  const earlier = new Map(before.map((value) => [value.id, value]));
  const later = new Set(after.map((value) => value.id));
  for (const value of after) {
    const previous = earlier.get(value.id);
    if (!previous) diff.added.push(entry(value));
    else if (shape(previous) !== shape(value)) diff.changed.push(entry(value));
  }
  for (const value of before) if (!later.has(value.id)) diff.removed.push(entry(value));
}

function nodeName(node: AutomationStudioFlowNode): string {
  const label = typeof node.label === "string" ? node.label.trim() : "";
  return label || "A step";
}

/** What makes a step that step. Where it sits on the canvas and what Core stamped on it are not the change. */
function nodeShape(node: AutomationStudioFlowNode): string {
  return JSON.stringify([node.definitionId, node.label ?? null, sorted(node.parameterValues ?? {})]);
}

function edgeShape(edge: AutomationStudioFlowEdge): string {
  return JSON.stringify([edge.sourceNodeId, edge.sourcePortId ?? null, edge.targetNodeId, edge.targetPortId ?? null]);
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, sorted(nested)]));
}

function bound(text: string): string {
  return text.length <= MAX_TEXT ? text : `${text.slice(0, MAX_TEXT - 1)}…`;
}

function bounded(entries: AutomationStudioFlowGraphDiffEntry[]): AutomationStudioFlowGraphDiffEntry[] {
  if (entries.length <= MAX_ENTRIES) return entries;
  return [...entries.slice(0, MAX_ENTRIES - 1), { id: "more", label: `and ${entries.length - MAX_ENTRIES + 1} more`, detail: null }];
}
