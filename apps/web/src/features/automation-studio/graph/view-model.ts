import { MarkerType, type Connection, type Edge, type Node, type ReactFlowInstance } from "@xyflow/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { AutomationNodeParameter, AutomationNodePort } from "fluxiq/automation-studio/nodes";
import type { JsonObject } from "../../programs/program-api";
import type { AutomationDragSelectBox } from "../workspace/layout";
import { automationEditorPalette, type AutomationPolicyNodeData, type AutomationRoutineNodeData } from "../types";
import { automationConnectionIsValid, automationPortColor, automationPortDisplayLabel, automationPortIdFromLabel, automationPortLabelFromId, automationPortTone, uniqueAutomationPorts } from "./ports";

export function defaultAutomationParameterValues(parameters: AutomationNodeParameter[]): JsonObject {
  return Object.fromEntries(parameters.map((parameter) => [parameter.id, parameter.defaultValue ?? defaultAutomationParameterValue(parameter)]));
}

function defaultAutomationParameterValue(parameter: AutomationNodeParameter): unknown {
  if (parameter.options?.[0]) return parameter.options[0].value;
  if (parameter.valueType === "number") return 0;
  if (parameter.valueType === "boolean") return false;
  if (parameter.valueType === "json") return {};
  return "";
}

export function automationVisualInputPorts(inputs: AutomationNodePort[], nodeDefinitionId: string): AutomationNodePort[] {
  if (inputs.length || nodeDefinitionId === "builtin.control.start") return inputs;
  return [{ id: "in", label: "In", valueType: "any", role: "control" }];
}

export function syncGraphNodes<T extends Record<string, unknown>>(currentNodes: Array<Node<T>>, nextNodes: Array<Node<T>>): Array<Node<T>> {
  const currentById = new Map(currentNodes.map((node) => [node.id, node]));
  return nextNodes.map((node) => {
    const current = currentById.get(node.id);
    return current ? { ...node, position: current.position } : node;
  });
}

export function spawnAutomationNodePosition<T extends Record<string, unknown>>(_selectedNodeId: string, nodes: Array<Node<T>>, _edges: Edge[], flow: Pick<ReactFlowInstance<Node<T>, Edge>, "screenToFlowPosition"> | null, canvasElement: HTMLElement | null): { x: number; y: number } {
  const bounds = canvasElement?.getBoundingClientRect();
  if (flow?.screenToFlowPosition && bounds) {
    const center = flow.screenToFlowPosition({
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2
    });
    return { x: center.x - 140, y: center.y - 98 };
  }
  if (flow?.screenToFlowPosition) {
    const center = flow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    return { x: center.x - 140, y: center.y - 98 };
  }
  return { x: 80 + (nodes.length % 4) * 300, y: 80 + Math.floor(nodes.length / 4) * 190 };
}

export function startAutomationNodeMarquee<T extends Record<string, unknown>>(options: {
  event: ReactPointerEvent<HTMLDivElement>;
  flow: Pick<ReactFlowInstance<Node<T>, Edge>, "screenToFlowPosition"> | null;
  frame: HTMLDivElement | null;
  nodes: Array<Node<T>>;
  setDragBox(value: AutomationDragSelectBox | null): void;
  setEdges(updater: (edges: Edge[]) => Edge[]): void;
  setNodes(updater: (nodes: Array<Node<T>>) => Array<Node<T>>): void;
  onSelected(nodes: Array<Node<T>>): void;
}) {
  if (options.event.button !== 2 || !options.flow || !options.frame) return;
  const target = options.event.target as HTMLElement;
  if (target.closest(".react-flow__node, .react-flow__handle, button, input, select, textarea, a")) return;
  options.event.preventDefault();
  options.event.stopPropagation();
  const flow = options.flow;
  const frameBounds = options.frame.getBoundingClientRect();
  const start = { x: options.event.clientX, y: options.event.clientY };
  let latest = start;
  const toBox = (point: { x: number; y: number }): AutomationDragSelectBox => ({
    left: Math.min(start.x, point.x) - frameBounds.left,
    top: Math.min(start.y, point.y) - frameBounds.top,
    width: Math.abs(point.x - start.x),
    height: Math.abs(point.y - start.y)
  });
  options.setDragBox(toBox(start));
  const onMove = (moveEvent: PointerEvent) => {
    latest = { x: moveEvent.clientX, y: moveEvent.clientY };
    options.setDragBox(toBox(latest));
  };
  const onUp = (upEvent: PointerEvent) => {
    latest = { x: upEvent.clientX, y: upEvent.clientY };
    const selectedIds = automationNodesInScreenRect(options.nodes, flow, start, latest);
    const selectedNodes = options.nodes.filter((node) => selectedIds.has(node.id));
    options.setNodes((nodes) => nodes.map((node) => ({ ...node, selected: selectedIds.has(node.id) })));
    options.setEdges((edges) => edges.map((edge) => ({ ...edge, selected: false })));
    options.onSelected(selectedNodes);
    options.setDragBox(null);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp, { once: true });
}

function automationNodesInScreenRect<T extends Record<string, unknown>>(nodes: Array<Node<T>>, flow: Pick<ReactFlowInstance<Node<T>, Edge>, "screenToFlowPosition">, start: { x: number; y: number }, end: { x: number; y: number }): Set<string> {
  const startFlow = flow.screenToFlowPosition(start);
  const endFlow = flow.screenToFlowPosition(end);
  const rect = {
    left: Math.min(startFlow.x, endFlow.x),
    top: Math.min(startFlow.y, endFlow.y),
    right: Math.max(startFlow.x, endFlow.x),
    bottom: Math.max(startFlow.y, endFlow.y)
  };
  return new Set(nodes.filter((node) => {
    const width = typeof node.measured?.width === "number" ? node.measured.width : 280;
    const height = typeof node.measured?.height === "number" ? node.measured.height : 196;
    const nodeRect = {
      left: node.position.x,
      top: node.position.y,
      right: node.position.x + width,
      bottom: node.position.y + height
    };
    return rect.left <= nodeRect.right && rect.right >= nodeRect.left && rect.top <= nodeRect.bottom && rect.bottom >= nodeRect.top;
  }).map((node) => node.id));
}

export function roundedAutomationPosition(position: { x: number; y: number }): { x: number; y: number } {
  return { x: Math.round(position.x), y: Math.round(position.y) };
}

export function createAutomationConnectionEdge<T extends AutomationPolicyNodeData | AutomationRoutineNodeData>(connection: { source: string | null; target: string | null; sourceHandle?: string | null; targetHandle?: string | null }, existingEdges: Edge[], prefix: string, nodes: Array<Node<T>>): Edge {
  const source = connection.source ?? "";
  const target = connection.target ?? "";
  const siblingIndex = existingEdges.filter((edge) => edge.source === source && edge.target === target).length;
  const routeIndex = existingEdges.filter((edge) => edge.source === source).length;
  const lane = chooseAutomationEdgeLane(source, target, existingEdges, nodes, `${prefix}-${source}-${target}-${siblingIndex}`, siblingIndex);
  const sourcePort = nodes.find((node) => node.id === source)?.data.outputs.find((port) => port.id === connection.sourceHandle);
  const label = sourcePort ? automationPortDisplayLabel(sourcePort) : automationPortLabelFromId(connection.sourceHandle) ?? (routeIndex === 0 ? "Next" : `Branch ${routeIndex + 1}`);
  const color = automationPortColor(automationPortTone(sourcePort ?? { id: connection.sourceHandle ?? "next", label, valueType: "any" }, "source"));
  return {
    id: `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    source,
    target,
    sourceHandle: connection.sourceHandle ?? "next",
    targetHandle: connection.targetHandle ?? "in",
    type: "automationEdge",
    label,
    data: { label, lane, siblingIndex, routeIndex, sourcePort: connection.sourceHandle ?? "next", targetPort: connection.targetHandle ?? "in" },
    markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
    style: { stroke: color, strokeWidth: 3 }
  };
}

export function reconnectAutomationEdge<T extends AutomationPolicyNodeData | AutomationRoutineNodeData>(oldEdge: Edge, connection: Connection, existingEdges: Edge[], nodes: Array<Node<T>>): Edge[] {
  const source = connection.source ?? oldEdge.source;
  const target = connection.target ?? oldEdge.target;
  const sourceHandle = connection.sourceHandle ?? oldEdge.sourceHandle ?? "next";
  const targetHandle = connection.targetHandle ?? oldEdge.targetHandle ?? "in";
  const nextConnection = { source, target, sourceHandle, targetHandle };
  if (!automationConnectionIsValid(nextConnection, nodes)) return existingEdges;
  const sourcePort = nodes.find((node) => node.id === source)?.data.outputs.find((port) => port.id === sourceHandle);
  const label = sourcePort ? automationPortDisplayLabel(sourcePort) : automationPortLabelFromId(sourceHandle) ?? String(oldEdge.label ?? "Next");
  const color = automationPortColor(automationPortTone(sourcePort ?? { id: sourceHandle, label, valueType: "any" }, "source"));
  const updatedEdges = existingEdges.map((edge) => {
    if (edge.id !== oldEdge.id) return edge;
    return {
      ...edge,
      source,
      target,
      sourceHandle,
      targetHandle,
      label,
      data: {
        ...(edge.data as Record<string, unknown> | undefined),
        label,
        sourcePort: sourceHandle,
        targetPort: targetHandle
      },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
      style: { ...edge.style, stroke: color }
    };
  });
  return rebalanceAutomationEdgeLanes(updatedEdges, nodes);
}

export function automationEdgeRoute(id: string, sourceX: number, sourceY: number, targetX: number, targetY: number, data: Record<string, unknown> | undefined): { kind: "step" | "loop"; lane: number } {
  const dx = targetX - sourceX;
  const lane = Number(data?.lane ?? automationEdgeLane(id));
  if (dx < -40) return { kind: "loop", lane };
  return { kind: "step", lane };
}

export function automationEdgeLane(id: string, index?: number): number {
  const lanes = [0, -44, 44, -82, 82, -120, 120, -158, 158];
  return lanes[(index ?? stableHash(id)) % lanes.length] ?? 42;
}

export function chooseAutomationEdgeLane<T extends Record<string, unknown>>(sourceId: string, targetId: string, existingEdges: Edge[], nodes: Array<Node<T>>, id: string, preferredIndex = 0): number {
  const source = automationNodeEdgePoint(nodes, sourceId, "source");
  const target = automationNodeEdgePoint(nodes, targetId, "target");
  const candidates = automationEdgeLaneCandidates(source && target ? target.y - source.y : 0, automationEdgeLane(id, preferredIndex));
  const scored = candidates.map((lane) => ({
    lane,
    score: automationEdgeLaneScore(sourceId, targetId, lane, existingEdges, nodes)
  })).sort((left, right) => left.score - right.score || Math.abs(left.lane) - Math.abs(right.lane));
  return scored[0]?.lane ?? 0;
}

export function rebalanceAutomationEdgeLanes<T extends Record<string, unknown>>(edges: Edge[], nodes: Array<Node<T>>): Edge[] {
  const placed: Edge[] = [];
  const sourceCounts = new Map<string, number>();
  const pairCounts = new Map<string, number>();
  const edgesByPair = new Map<string, Edge[]>();
  for (const edge of edges) {
    const pairKey = `${edge.source}->${edge.target}`;
    edgesByPair.set(pairKey, [...(edgesByPair.get(pairKey) ?? []), edge]);
  }
  const ordered = [...edges].sort((left, right) => {
    const leftDistance = automationEdgeNodeDistance(left, nodes);
    const rightDistance = automationEdgeNodeDistance(right, nodes);
    return leftDistance - rightDistance || left.id.localeCompare(right.id);
  });
  const rebalancedById = new Map<string, Edge>();
  const processedIds = new Set<string>();
  for (const edge of ordered) {
    if (processedIds.has(edge.id)) continue;
    const sourceCount = sourceCounts.get(edge.source) ?? 0;
    const pairKey = `${edge.source}->${edge.target}`;
    const pairEdges = edgesByPair.get(pairKey) ?? [edge];
    if (pairEdges.length > 1) {
      const sortedPairEdges = [...pairEdges].sort((left, right) => {
        const leftOrder = automationSourceHandleOrder(nodes, left.source, left.sourceHandle ?? String((left.data as Record<string, unknown> | undefined)?.sourcePort ?? ""));
        const rightOrder = automationSourceHandleOrder(nodes, right.source, right.sourceHandle ?? String((right.data as Record<string, unknown> | undefined)?.sourcePort ?? ""));
        return leftOrder - rightOrder || left.id.localeCompare(right.id);
      });
      sortedPairEdges.forEach((pairEdge, pairIndex) => {
        const nextSourceCount = sourceCounts.get(pairEdge.source) ?? 0;
        const lane = automationOrderedEdgeLane(pairIndex, sortedPairEdges.length);
        const data = { ...(pairEdge.data as Record<string, unknown> | undefined), lane, siblingIndex: pairIndex, routeIndex: nextSourceCount };
        const nextEdge = { ...pairEdge, data };
        sourceCounts.set(pairEdge.source, nextSourceCount + 1);
        pairCounts.set(pairKey, pairIndex + 1);
        processedIds.add(pairEdge.id);
        placed.push(nextEdge);
        rebalancedById.set(pairEdge.id, nextEdge);
      });
      continue;
    }
    const pairCount = pairCounts.get(pairKey) ?? 0;
    sourceCounts.set(edge.source, sourceCount + 1);
    pairCounts.set(pairKey, pairCount + 1);
    const lane = chooseAutomationEdgeLane(edge.source, edge.target, placed, nodes, edge.id, pairCount);
    const data = { ...(edge.data as Record<string, unknown> | undefined), lane, siblingIndex: pairCount, routeIndex: sourceCount };
    const nextEdge = { ...edge, data };
    processedIds.add(edge.id);
    placed.push(nextEdge);
    rebalancedById.set(edge.id, nextEdge);
  }
  return edges.map((edge) => rebalancedById.get(edge.id) ?? edge);
}

export function automationOrderedEdgeLane(index: number, total: number): number {
  if (total <= 1) return 0;
  const centered = index - (total - 1) / 2;
  const evenNudge = total % 2 === 0 ? Math.sign(centered) * 22 : 0;
  return Math.round(centered * 44 + evenNudge);
}

export function automationSourceHandleOrder<T extends Record<string, unknown>>(nodes: Array<Node<T>>, sourceId: string, sourceHandle: string | null | undefined): number {
  const outputs = (nodes.find((node) => node.id === sourceId)?.data as { outputs?: AutomationNodePort[] } | undefined)?.outputs ?? [];
  const index = outputs.findIndex((port) => port.id === sourceHandle);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

export function automationEdgeNodeDistance<T extends Record<string, unknown>>(edge: Edge, nodes: Array<Node<T>>): number {
  const source = automationNodeEdgePoint(nodes, edge.source, "source");
  const target = automationNodeEdgePoint(nodes, edge.target, "target");
  if (!source || !target) return Number.MAX_SAFE_INTEGER;
  return Math.hypot(target.x - source.x, target.y - source.y);
}

export function automationEdgeLaneScore<T extends Record<string, unknown>>(sourceId: string, targetId: string, lane: number, existingEdges: Edge[], nodes: Array<Node<T>>): number {
  const source = automationNodeEdgePoint(nodes, sourceId, "source");
  const target = automationNodeEdgePoint(nodes, targetId, "target");
  if (!source || !target) return Math.abs(lane) * 0.3;
  const candidateBand = automationEdgeBand(source, target, lane);
  const dy = target.y - source.y;
  let score = Math.abs(lane) * 0.16 + automationDirectionalLanePenalty(dy, lane);
  for (const edge of existingEdges) {
    const existingSource = automationNodeEdgePoint(nodes, edge.source, "source");
    const existingTarget = automationNodeEdgePoint(nodes, edge.target, "target");
    if (!existingSource || !existingTarget) continue;
    const existingLane = Number((edge.data as Record<string, unknown> | undefined)?.lane ?? 0);
    const existingBand = automationEdgeBand(existingSource, existingTarget, existingLane);
    const samePair = edge.source === sourceId && edge.target === targetId;
    const sameSourceOrTarget = edge.source === sourceId || edge.target === targetId || edge.source === targetId || edge.target === sourceId;
    const bandCloseness = automationEdgeBandCloseness(candidateBand, existingBand);
    if (samePair && Math.abs(lane - existingLane) < 16) score += 500;
    if (samePair) score += Math.max(0, 52 - bandCloseness.minDistance) * 10;
    if (automationEdgeBandsOverlap(candidateBand, existingBand)) {
      score += Math.max(0, 42 - bandCloseness.minDistance) * (sameSourceOrTarget ? 8 : 5);
      score += Math.max(0, 34 - bandCloseness.averageDistance) * (sameSourceOrTarget ? 4 : 2);
    }
    if (automationSegmentsIntersect(source, target, existingSource, existingTarget)) {
      score += Math.max(0, 44 - Math.abs(lane - existingLane)) * 4;
    }
    if (Math.abs(lane - existingLane) < 8 && automationEdgeBandsOverlap(candidateBand, existingBand)) score += 120;
  }
  return score;
}

export function automationEdgeLaneCandidates(dy: number, preferredLane: number): number[] {
  const downward = [0, 44, 82, 120, 158, -44, -82, -120, -158];
  const upward = [0, -44, -82, -120, -158, 44, 82, 120, 158];
  const horizontal = [0, preferredLane, -44, 44, -82, 82, -120, 120, -158, 158];
  const base = dy > 24 ? downward : dy < -24 ? upward : horizontal;
  return uniqueNumbers([preferredLane, ...base]);
}

export function automationDirectionalLanePenalty(dy: number, lane: number): number {
  if (Math.abs(dy) < 24 || Math.abs(lane) < 1) return 0;
  const sameDirection = Math.sign(dy) === Math.sign(lane);
  return sameDirection ? 0 : 140 + Math.abs(lane) * 1.8;
}

export function automationNodeEdgePoint<T extends Record<string, unknown>>(nodes: Array<Node<T>>, nodeId: string, side: "source" | "target"): { x: number; y: number } | null {
  const node = nodes.find((item) => item.id === nodeId);
  if (!node) return null;
  const width = typeof node.measured?.width === "number" ? node.measured.width : 280;
  const height = typeof node.measured?.height === "number" ? node.measured.height : 196;
  return {
    x: node.position.x + (side === "source" ? width : 0),
    y: node.position.y + height / 2
  };
}

export type AutomationEdgeBand = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  samples: Array<{ x: number; y: number }>;
};

export function automationEdgeBand(source: { x: number; y: number }, target: { x: number; y: number }, lane: number): AutomationEdgeBand {
  const controls = automationLaneEdgeControls(source.x, source.y, target.x, target.y, lane);
  const samples = [0.18, 0.34, 0.5, 0.66, 0.82].map((t) => automationCubicPoint(source, controls.control1, controls.control2, target, t));
  return {
    xMin: Math.min(source.x, target.x, ...samples.map((point) => point.x)),
    xMax: Math.max(source.x, target.x, ...samples.map((point) => point.x)),
    yMin: Math.min(source.y, target.y, ...samples.map((point) => point.y)) - 18,
    yMax: Math.max(source.y, target.y, ...samples.map((point) => point.y)) + 18,
    samples
  };
}

export function automationEdgeBandCloseness(left: AutomationEdgeBand, right: AutomationEdgeBand): { minDistance: number; averageDistance: number } {
  const distances = left.samples.map((point, index) => Math.abs(point.y - (right.samples[index]?.y ?? point.y)));
  return {
    minDistance: Math.min(...distances),
    averageDistance: distances.reduce((total, distance) => total + distance, 0) / Math.max(1, distances.length)
  };
}

export function automationEdgeBandsOverlap(left: AutomationEdgeBand, right: AutomationEdgeBand): boolean {
  const xOverlap = Math.min(left.xMax, right.xMax) - Math.max(left.xMin, right.xMin);
  const yOverlap = Math.min(left.yMax, right.yMax) - Math.max(left.yMin, right.yMin);
  return xOverlap > 16 && yOverlap > 0;
}

export function automationSegmentsLikelyOverlap(a1: { x: number; y: number }, a2: { x: number; y: number }, b1: { x: number; y: number }, b2: { x: number; y: number }): boolean {
  const xOverlap = Math.min(Math.max(a1.x, a2.x), Math.max(b1.x, b2.x)) - Math.max(Math.min(a1.x, a2.x), Math.min(b1.x, b2.x));
  const yOverlap = Math.min(Math.max(a1.y, a2.y), Math.max(b1.y, b2.y)) - Math.max(Math.min(a1.y, a2.y), Math.min(b1.y, b2.y));
  return xOverlap > -80 && yOverlap > -80;
}

export function automationSegmentsIntersect(a1: { x: number; y: number }, a2: { x: number; y: number }, b1: { x: number; y: number }, b2: { x: number; y: number }): boolean {
  const d1 = automationPointDirection(b1, b2, a1);
  const d2 = automationPointDirection(b1, b2, a2);
  const d3 = automationPointDirection(a1, a2, b1);
  const d4 = automationPointDirection(a1, a2, b2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export function automationPointDirection(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  return (c.x - a.x) * (b.y - a.y) - (b.x - a.x) * (c.y - a.y);
}

export function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values)];
}

export function automationLoopEdgePath(sourceX: number, sourceY: number, targetX: number, targetY: number, lane: number): [string, number, number] {
  const source = { x: sourceX, y: sourceY };
  const target = { x: targetX, y: targetY };
  const direction = lane < 0 ? -1 : 1;
  const distance = Math.abs(targetX - sourceX);
  const lift = direction * (44 + Math.min(96, distance * 0.14) + Math.abs(lane) * 0.34);
  const spread = Math.max(82, Math.min(190, distance * 0.34));
  const control1 = { x: sourceX + spread, y: sourceY + lift };
  const control2 = { x: targetX - spread, y: targetY + lift };
  const label = automationCubicPoint(source, control1, control2, target, 0.5);
  return [`M ${sourceX},${sourceY} C ${control1.x},${control1.y} ${control2.x},${control2.y} ${targetX},${targetY}`, label.x, label.y];
}

export function automationLaneEdgePath(sourceX: number, sourceY: number, targetX: number, targetY: number, lane: number, labelBias = 0.5): [string, number, number] {
  const controls = automationLaneEdgeControls(sourceX, sourceY, targetX, targetY, lane, labelBias);
  return [
    `M ${sourceX},${sourceY} C ${controls.control1.x},${controls.control1.y} ${controls.control2.x},${controls.control2.y} ${targetX},${targetY}`,
    controls.labelX,
    controls.labelY
  ];
}

export function automationLaneEdgeControls(sourceX: number, sourceY: number, targetX: number, targetY: number, lane: number, labelBias = 0.5): { control1: { x: number; y: number }; control2: { x: number; y: number }; labelX: number; labelY: number } {
  const dx = targetX - sourceX;
  const distance = Math.max(1, Math.abs(dx));
  const forwardDistance = Math.max(1, dx);
  const horizontal = dx > 0
    ? Math.min(210, Math.max(44, forwardDistance * 0.42), Math.max(36, forwardDistance * 0.52))
    : Math.min(160, Math.max(72, distance * 0.28));
  const control1X = sourceX + horizontal;
  const control2X = targetX - horizontal;
  const lift = Math.abs(lane) < 1 ? 0 : lane;
  const curveLift = lift * 0.62;
  const control1Y = sourceY + curveLift;
  const control2Y = targetY + curveLift;
  const label = automationCubicPoint(
    { x: sourceX, y: sourceY },
    { x: control1X, y: control1Y },
    { x: control2X, y: control2Y },
    { x: targetX, y: targetY },
    labelBias
  );
  const labelX = label.x;
  const labelY = label.y;
  return { control1: { x: control1X, y: control1Y }, control2: { x: control2X, y: control2Y }, labelX, labelY };
}

export function automationCubicPoint(source: { x: number; y: number }, control1: { x: number; y: number }, control2: { x: number; y: number }, target: { x: number; y: number }, t: number): { x: number; y: number } {
  const u = 1 - t;
  return {
    x: u ** 3 * source.x + 3 * u ** 2 * t * control1.x + 3 * u * t ** 2 * control2.x + t ** 3 * target.x,
    y: u ** 3 * source.y + 3 * u ** 2 * t * control1.y + 3 * u * t ** 2 * control2.y + t ** 3 * target.y
  };
}

export function stableHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return hash;
}

export function policyToReactFlowGraph(policy: any, selectedNodeId = ""): { nodes: Node<AutomationPolicyNodeData>[]; edges: Edge[] } {
  const policyNodes = policy?.nodes ?? [];
  const policyEdges = policy?.edges ?? [];
  const positions = layoutAutomationPolicyNodes(policyNodes, policyEdges);
  const nodes: Node<AutomationPolicyNodeData>[] = policyNodes.map((node: any, index: number) => ({
    id: node.id,
    type: "policyNode",
    position: node.metadata?.position && typeof node.metadata.position === "object"
      ? { x: Number(node.metadata.position.x ?? 0), y: Number(node.metadata.position.y ?? 0) }
      : positions.get(node.id) ?? { x: index * 340, y: 160 },
    selected: node.id === selectedNodeId,
    data: {
      label: node.label ?? node.id,
      description: generatedPolicyNodeDescription(node),
      customDescription: node.metadata?.customDescription,
      nodeDefinitionId: node.metadata?.nodeDefinitionId,
      nodeDefinitionVersion: node.metadata?.nodeDefinitionVersion,
      icon: generatedPolicyNodeIcon(node, index),
      actionTypes: (node.actions ?? []).map((action: any) => action.actionType),
      recovery: node.recovery?.strategy ?? "ready",
      evidenceCount: node.sourceEvidence?.length ?? 0,
      readinessCount: countConditionLeaves(node.readinessConditions),
      successCount: countConditionLeaves(node.successConditions),
      inputs: generatedPolicyInputPorts(node, index),
      outputs: generatedPolicyOutputPorts(node, policyEdges),
      parameters: Array.isArray(node.metadata?.parameters) ? node.metadata.parameters : [],
      parameterValues: node.metadata?.parameterValues && typeof node.metadata.parameterValues === "object" ? node.metadata.parameterValues : {},
      isStart: index === 0,
      confidence: node.generatedMetadata?.confidence,
      timeoutMs: node.timeout?.timeoutMs ?? node.timeoutMs
    }
  }));
  const outgoingCounts = new Map<string, number>();
  const edges: Edge[] = [];
  for (const [index, edge] of policyEdges.entries()) {
    const source = String(edge.fromNodeId ?? edge.source ?? "");
    const target = String(edge.toNodeId ?? edge.target ?? "");
    const count = outgoingCounts.get(source) ?? 0;
    outgoingCounts.set(source, count + 1);
    const fallbackLabel = edge.label ?? edge.kind ?? edge.type ?? (edge.probability !== undefined ? `${Math.round(Number(edge.probability) * 100)}%` : "Next");
    const id = edge.id ?? `${edge.fromNodeId}-${edge.toNodeId}-${index}`;
    const sourcePort = policyEdgeSourcePort(edge, nodes.find((node) => node.id === source)?.data.outputs ?? [], fallbackLabel, count);
    const targetPort = policyEdgeTargetPort(edge, nodes.find((node) => node.id === target)?.data.inputs ?? []);
    const label = sourcePort ? automationPortDisplayLabel(sourcePort) : String(fallbackLabel);
    const color = automationPortColor(automationPortTone(sourcePort ?? { id: automationPortIdFromLabel(label), label, valueType: "any", role: generatedPolicyOutputRole(automationPortIdFromLabel(label), label) }, "source"));
    const nextEdge: Edge = {
      id,
      source,
      target,
      sourceHandle: sourcePort?.id ?? automationPortIdFromLabel(label),
      targetHandle: targetPort?.id ?? "in",
      type: "automationEdge",
      animated: false,
      data: { label, lane: chooseAutomationEdgeLane(source, target, edges, nodes, id, count), siblingIndex: count, routeIndex: count, sourcePort: sourcePort?.id ?? automationPortIdFromLabel(label), targetPort: targetPort?.id ?? "in" },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color,
        width: 18,
        height: 18
      },
      label,
      style: { stroke: color, strokeWidth: 3 }
    };
    edges.push(nextEdge);
  }
  return { nodes, edges };
}

export function taskFlowToReactFlowGraph(flow: any, selectedNodeId = ""): { nodes: Node<AutomationPolicyNodeData>[]; edges: Edge[] } {
  if (!flow) return { nodes: [], edges: [] };
  const flowNodes = flow.nodes ?? [];
  const flowEdges = flow.edges ?? [];
  const positions = layoutAutomationPolicyNodes(
    flowNodes.map((node: any) => ({ id: node.id, metadata: { position: node.position } })),
    flowEdges.map((edge: any) => ({ fromNodeId: edge.sourceNodeId, toNodeId: edge.targetNodeId }))
  );
  const nodes: Node<AutomationPolicyNodeData>[] = flowNodes.map((node: any, index: number) => {
    const definition = automationNodeSpecForDefinition(node.definitionId);
    const parameterValues = node.parameterValues && typeof node.parameterValues === "object" ? node.parameterValues : {};
    const inputs = automationVisualInputPorts(definition?.inputs ?? [], node.definitionId);
    const outputs = flowNodeOutputPorts(node, flowEdges, definition?.outputs ?? []);
    return {
      id: node.id,
      type: "policyNode",
      position: node.position && typeof node.position === "object"
        ? { x: Number(node.position.x ?? 0), y: Number(node.position.y ?? 0) }
        : positions.get(node.id) ?? { x: index * 340, y: 160 },
      selected: node.id === selectedNodeId,
      data: {
        label: node.label ?? definition?.label ?? node.id,
        description: node.description ?? definition?.description ?? "Task graph node",
        customDescription: node.metadata?.customDescription,
        nodeDefinitionId: node.definitionId,
        nodeDefinitionVersion: node.definitionVersion,
        ...(definition?.icon !== undefined ? { icon: definition.icon } : {}),
        actionTypes: Array.isArray(parameterValues.actions) ? parameterValues.actions.map((action: any) => String(action.actionType ?? "")).filter(Boolean) : [],
        recovery: typeof parameterValues.recovery?.strategy === "string" ? parameterValues.recovery.strategy : definition?.family ?? "ready",
        evidenceCount: 0,
        readinessCount: inputs.length,
        successCount: outputs.length,
        inputs,
        outputs,
        parameters: definition?.parameters ?? [],
        parameterValues,
        metadata: node.metadata ?? {},
        isStart: node.definitionId === "builtin.control.start" || index === 0,
        timeoutMs: typeof parameterValues.timeout?.timeoutMs === "number" ? parameterValues.timeout.timeoutMs : undefined
      }
    };
  });
  const edges: Edge[] = [];
  const outgoingCounts = new Map<string, number>();
  for (const [index, edge] of flowEdges.entries()) {
    const source = String(edge.sourceNodeId ?? edge.source ?? "");
    const target = String(edge.targetNodeId ?? edge.target ?? "");
    const count = outgoingCounts.get(source) ?? 0;
    outgoingCounts.set(source, count + 1);
    const sourcePorts = nodes.find((node) => node.id === source)?.data.outputs ?? [];
    const targetPorts = nodes.find((node) => node.id === target)?.data.inputs ?? [];
    const sourcePort = flowEdgeSourcePort(edge, sourcePorts, count);
    const targetPort = flowEdgeTargetPort(edge, targetPorts);
    const label = sourcePort ? automationPortDisplayLabel(sourcePort) : String(edge.label ?? edge.metadata?.label ?? "Next");
    const color = automationPortColor(automationPortTone(sourcePort ?? { id: edge.sourcePortId ?? "next", label, valueType: "any", role: generatedPolicyOutputRole(edge.sourcePortId ?? "next", label) }, "source"));
    edges.push({
      id: edge.id ?? `${source}-${target}-${index}`,
      source,
      target,
      sourceHandle: sourcePort?.id ?? edge.sourcePortId ?? automationPortIdFromLabel(label),
      targetHandle: targetPort?.id ?? edge.targetPortId ?? "in",
      type: "automationEdge",
      data: { ...(edge.metadata ?? {}), label, lane: chooseAutomationEdgeLane(source, target, edges, nodes, edge.id ?? `${source}-${target}-${index}`, count), siblingIndex: count, routeIndex: count, sourcePort: sourcePort?.id ?? edge.sourcePortId ?? automationPortIdFromLabel(label), targetPort: targetPort?.id ?? edge.targetPortId ?? "in" },
      label,
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
      style: { stroke: color, strokeWidth: 3 }
    });
  }
  return { nodes, edges };
}

function automationNodeSpecForDefinition(definitionId: string | undefined) {
  return automationEditorPalette.flatMap((group) => group.nodes).find((node) => node.id === definitionId);
}

function flowNodeOutputPorts(node: any, flowEdges: any[], definitionOutputs: AutomationNodePort[]): AutomationNodePort[] {
  if (definitionOutputs.length) return definitionOutputs;
  const ports = flowEdges
    .filter((edge: any) => String(edge.sourceNodeId ?? edge.source ?? "") === String(node.id))
    .map((edge: any, index: number) => {
      const label = edge.label ?? edge.metadata?.label ?? edge.sourcePortId ?? (index === 0 ? "Next" : `Branch ${index + 1}`);
      const id = String(edge.sourcePortId ?? automationPortIdFromLabel(label));
      return { id, label: String(label), valueType: "any" as const, role: generatedPolicyOutputRole(id, label) };
    });
  return ports.length ? uniqueAutomationPorts(ports) : [{ id: "success", label: "Success", valueType: "any", role: "success" }];
}

function flowEdgeSourcePort(edge: any, ports: AutomationNodePort[], routeIndex: number): AutomationNodePort | undefined {
  const requestedId = String(edge.sourcePortId ?? edge.sourceHandle ?? edge.metadata?.sourcePort ?? "").trim();
  if (requestedId) {
    const byId = ports.find((port) => port.id === requestedId);
    if (byId) return byId;
  }
  return ports[routeIndex] ?? ports[0];
}

function flowEdgeTargetPort(edge: any, ports: AutomationNodePort[]): AutomationNodePort | undefined {
  const requestedId = String(edge.targetPortId ?? edge.targetHandle ?? edge.metadata?.targetPort ?? "").trim();
  return requestedId ? ports.find((port) => port.id === requestedId) : ports.find((port) => port.id === "in") ?? ports[0];
}

function policyEdgeSourcePort(edge: any, ports: AutomationNodePort[], label: unknown, routeIndex: number): AutomationNodePort | undefined {
  const requestedId = String(edge.sourceHandle ?? edge.sourcePortId ?? edge.sourcePort ?? edge.metadata?.sourcePortId ?? edge.metadata?.sourcePort ?? edge.data?.sourcePort ?? "").trim();
  if (requestedId) {
    const byId = ports.find((port) => port.id === requestedId);
    if (byId) return byId;
  }
  const labelId = automationPortIdFromLabel(label);
  return ports.find((port) => port.id === labelId)
    ?? ports.find((port) => automationPortDisplayLabel(port).toLowerCase() === String(label ?? "").toLowerCase())
    ?? ports[routeIndex]
    ?? ports[0];
}

function policyEdgeTargetPort(edge: any, ports: AutomationNodePort[]): AutomationNodePort | undefined {
  const requestedId = String(edge.targetHandle ?? edge.targetPortId ?? edge.targetPort ?? edge.metadata?.targetPortId ?? edge.metadata?.targetPort ?? edge.data?.targetPort ?? "").trim();
  return requestedId ? ports.find((port) => port.id === requestedId) : ports.find((port) => port.id === "in") ?? ports[0];
}

export function generatedPolicyInputPorts(node: any, index: number): AutomationNodePort[] {
  if (index === 0 || node.isStart) return [];
  return [{ id: "in", label: "In", valueType: "any", role: "control" }];
}

export function generatedPolicyNodeDescription(node: any): string {
  const actions = (node.actions ?? []).map((action: any) => action.actionType).filter(Boolean);
  if (actions.length) return actions.join(", ");
  if (node.description) return String(node.description);
  if (node.recovery?.strategy) return `Recovery: ${String(node.recovery.strategy).replace(/_/g, " ")}`;
  return "Generated policy node";
}

export function generatedPolicyNodeIcon(node: any, index: number): string {
  if (index === 0 || node.isStart) return "workflow";
  const actions = (node.actions ?? []).map((action: any) => String(action.actionType ?? "").toLowerCase());
  if (actions.some((action: string) => action.includes("database") || action.includes("record"))) return "database";
  if (actions.some((action: string) => action.includes("random"))) return "dice-5";
  if (actions.some((action: string) => action.includes("calculate") || action.includes("math"))) return "calculator";
  if (node.recovery?.strategy) return "shield";
  return "git-branch";
}

export function generatedPolicyOutputPorts(node: any, policyEdges: any[]): AutomationNodePort[] {
  const outgoing = policyEdges.filter((edge) => String(edge.fromNodeId ?? edge.source ?? "") === String(node.id));
  const ports = outgoing.map((edge, index) => {
    const label = edge.label ?? edge.kind ?? edge.type ?? (edge.probability !== undefined ? `${Math.round(Number(edge.probability) * 100)}%` : index === 0 ? "Next" : `Branch ${index + 1}`);
    const id = automationPortIdFromLabel(label);
    return { id, label: String(label), valueType: "any" as const, role: generatedPolicyOutputRole(id, label) };
  });
  return ports.length ? uniqueAutomationPorts(ports) : [{ id: "success", label: "Success", valueType: "any", role: "success" }];
}

export function generatedPolicyOutputRole(id: string, label: unknown): NonNullable<AutomationNodePort["role"]> {
  const semantic = `${id} ${String(label ?? "")}`.toLowerCase();
  if (semantic.includes("success") || semantic.includes("pass") || semantic.includes("approved")) return "success";
  if (semantic.includes("fail") || semantic.includes("error") || semantic.includes("timeout") || semantic.includes("reject")) return "failure";
  return "branch";
}

export function layoutAutomationPolicyNodes(policyNodes: any[], policyEdges: any[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const ids = policyNodes.map((node) => String(node.id));
  const knownIds = new Set(ids);
  const outgoing = new Map<string, string[]>();
  const incomingCount = new Map<string, number>();
  for (const id of ids) incomingCount.set(id, 0);
  for (const edge of policyEdges) {
    const source = String(edge.fromNodeId ?? edge.source ?? "");
    const target = String(edge.toNodeId ?? edge.target ?? "");
    if (!knownIds.has(source) || !knownIds.has(target)) continue;
    outgoing.set(source, [...(outgoing.get(source) ?? []), target]);
    incomingCount.set(target, (incomingCount.get(target) ?? 0) + 1);
  }

  const roots = ids.filter((id) => (incomingCount.get(id) ?? 0) === 0);
  const queue = roots.length ? roots.map((id) => ({ id, level: 0 })) : ids.slice(0, 1).map((id) => ({ id, level: 0 }));
  const levelById = new Map<string, number>();
  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;
    const previousLevel = levelById.get(current.id);
    if (previousLevel !== undefined) continue;
    levelById.set(current.id, current.level);
    for (const target of outgoing.get(current.id) ?? []) queue.push({ id: target, level: current.level + 1 });
  }
  for (const id of ids) {
    if (!levelById.has(id)) levelById.set(id, Math.max(0, ...levelById.values()) + 1);
  }

  const lanesByLevel = new Map<number, string[]>();
  for (const id of ids) {
    const level = levelById.get(id) ?? 0;
    lanesByLevel.set(level, [...(lanesByLevel.get(level) ?? []), id]);
  }
  for (const [level, levelIds] of lanesByLevel) {
    const centerOffset = (levelIds.length - 1) / 2;
    levelIds.forEach((id, index) => {
      positions.set(id, {
        x: level * 360,
        y: 220 + (index - centerOffset) * 190
      });
    });
  }
  return positions;
}

export function routineToReactFlowGraph(): { nodes: Node<AutomationRoutineNodeData>[]; edges: Edge[] } {
  return { nodes: [], edges: [] };
}

export function edgeVisuals(edge: any): { color: string; style: Edge["style"] } {
  const kind = String(edge.kind ?? edge.type ?? edge.label ?? "").toLowerCase();
  const color = kind.includes("fail") ? "#d13212" : kind.includes("recover") || kind.includes("retry") ? "#b35c00" : kind.includes("success") ? "#037f0c" : "#0972d3";
  const confidence = Number(edge.probability ?? edge.confidence ?? 0.7);
  return {
    color,
    style: {
      stroke: color,
      strokeWidth: Math.max(2, Math.min(6, 1 + confidence * 5)),
      strokeDasharray: kind.includes("optional") || kind.includes("fallback") ? "7 5" : undefined
    }
  };
}

export function countConditionLeaves(group: any): number {
  if (!group?.conditions) return 0;
  return group.conditions.reduce((total: number, condition: any) => total + (condition.signalPath ? 1 : countConditionLeaves(condition)), 0);
}

export function formatDbCell(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return shortJson(value);
}

export function parseJsonObject(text: string): { ok: true; value: JsonObject } | { ok: false; error: string } {
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? { ok: true, value: value as JsonObject } : { ok: false, error: "JSON must be an object" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function flattenRunLogs(runs: any[]): Array<{ atMs: number; target: string; loop: string; status: string; message: string; type: string }> {
  return runs.flatMap((run) => {
    const executions = run.executions ?? [];
    if (!executions.length) return [{ atMs: run.updatedAtMs ?? run.startedAtMs ?? 0, target: run.targetId ?? run.name, loop: `${run.loopsCompleted ?? 0}/${run.loopsTotal ?? 1}`, status: run.status, message: run.metadata?.message ?? "-", type: run.targetType ?? "run" }];
    return executions.map((execution: any) => ({ atMs: execution.atMs, target: run.targetId ?? run.name, loop: `${execution.loop}/${run.loopsTotal ?? 1}`, status: execution.ok ? "success" : "failed", message: execution.error ?? shortJson(execution.result), type: run.targetType ?? "run" }));
  });
}

function shortJson(value: unknown): string {
  if (!value) return "-";
  const text = JSON.stringify(value);
  return text.length > 90 ? `${text.slice(0, 90)}...` : text;
}





























































































