import { MarkerType, type Connection, type Edge, type Node } from "@xyflow/react";
import type { AutomationNodePort } from "fluxiq/automation-studio/nodes";
import {
  automationConnectionIsValid,
  automationPortColor,
  automationPortDisplayLabel,
  automationPortLabelFromId,
  automationPortTone
} from "./ports";

type AutomationEdgeNodeData = { inputs?: AutomationNodePort[]; outputs?: AutomationNodePort[] };

export function createAutomationConnectionEdge<T extends AutomationEdgeNodeData>(connection: { source: string | null; target: string | null; sourceHandle?: string | null; targetHandle?: string | null }, existingEdges: Edge[], prefix: string, nodes: Array<Node<T>>): Edge {
  const source = connection.source ?? "";
  const target = connection.target ?? "";
  const siblingIndex = existingEdges.filter((edge) => edge.source === source && edge.target === target).length;
  const routeIndex = existingEdges.filter((edge) => edge.source === source).length;
  const lane = chooseAutomationEdgeLane(source, target, existingEdges, nodes, `${prefix}-${source}-${target}-${siblingIndex}`, siblingIndex);
  const sourcePort = nodes.find((node) => node.id === source)?.data.outputs?.find((port) => port.id === connection.sourceHandle);
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

export function reconnectAutomationEdge<T extends AutomationEdgeNodeData>(oldEdge: Edge, connection: Connection, existingEdges: Edge[], nodes: Array<Node<T>>): Edge[] {
  const source = connection.source ?? oldEdge.source;
  const target = connection.target ?? oldEdge.target;
  const sourceHandle = connection.sourceHandle ?? oldEdge.sourceHandle ?? "next";
  const targetHandle = connection.targetHandle ?? oldEdge.targetHandle ?? "in";
  const nextConnection = { source, target, sourceHandle, targetHandle };
  if (!automationConnectionIsValid(nextConnection, nodes)) return existingEdges;
  const sourcePort = nodes.find((node) => node.id === source)?.data.outputs?.find((port) => port.id === sourceHandle);
  const label = sourcePort ? automationPortDisplayLabel(sourcePort) : automationPortLabelFromId(sourceHandle) ?? String(oldEdge.label ?? "Next");
  const color = automationPortColor(automationPortTone(sourcePort ?? { id: sourceHandle, label, valueType: "any" }, "source"));
  const siblingIndex = existingEdges.filter((edge) => edge.id !== oldEdge.id && edge.source === source && edge.target === target).length;
  const routeIndex = existingEdges.filter((edge) => edge.id !== oldEdge.id && edge.source === source).length;
  const lane = Number((oldEdge.data as Record<string, unknown> | undefined)?.lane ?? automationEdgeLane(oldEdge.id, siblingIndex));
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
        lane,
        siblingIndex,
        routeIndex,
        sourcePort: sourceHandle,
        targetPort: targetHandle
      },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 18, height: 18 },
      style: { ...edge.style, stroke: color }
    };
  });
  return updatedEdges;
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
    if (automationSegmentsIntersect(source, target, existingSource, existingTarget)) score += Math.max(0, 44 - Math.abs(lane - existingLane)) * 4;
    if (Math.abs(lane - existingLane) < 8 && automationEdgeBandsOverlap(candidateBand, existingBand)) score += 120;
  }
  return score;
}

export function automationEdgeLaneCandidates(dy: number, preferredLane: number): number[] {
  const downward = [0, 44, 82, 120, 158, -44, -82, -120, -158];
  const upward = [0, -44, -82, -120, -158, 44, 82, 120, 158];
  const horizontal = [0, preferredLane, -44, 44, -82, 82, -120, 120, -158, 158];
  return uniqueNumbers([preferredLane, ...(dy > 24 ? downward : dy < -24 ? upward : horizontal)]);
}

export function automationDirectionalLanePenalty(dy: number, lane: number): number {
  if (Math.abs(dy) < 24 || Math.abs(lane) < 1) return 0;
  return Math.sign(dy) === Math.sign(lane) ? 0 : 140 + Math.abs(lane) * 1.8;
}

export function automationNodeEdgePoint<T extends Record<string, unknown>>(nodes: Array<Node<T>>, nodeId: string, side: "source" | "target"): { x: number; y: number } | null {
  const node = nodes.find((item) => item.id === nodeId);
  if (!node) return null;
  const width = typeof node.measured?.width === "number" ? node.measured.width : 280;
  const height = typeof node.measured?.height === "number" ? node.measured.height : 196;
  return { x: node.position.x + (side === "source" ? width : 0), y: node.position.y + height / 2 };
}

export type AutomationEdgeBand = { xMin: number; xMax: number; yMin: number; yMax: number; samples: Array<{ x: number; y: number }> };

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
  return { minDistance: Math.min(...distances), averageDistance: distances.reduce((total, distance) => total + distance, 0) / Math.max(1, distances.length) };
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

export function uniqueNumbers(values: number[]): number[] { return [...new Set(values)]; }

export function automationLoopEdgePath(sourceX: number, sourceY: number, targetX: number, targetY: number, lane: number): [string, number, number] {
  const source = { x: sourceX, y: sourceY };
  const target = { x: targetX, y: targetY };
  const lift = (lane < 0 ? -1 : 1) * (44 + Math.min(96, Math.abs(targetX - sourceX) * 0.14) + Math.abs(lane) * 0.34);
  const spread = Math.max(82, Math.min(190, Math.abs(targetX - sourceX) * 0.34));
  const control1 = { x: sourceX + spread, y: sourceY + lift };
  const control2 = { x: targetX - spread, y: targetY + lift };
  const label = automationCubicPoint(source, control1, control2, target, 0.5);
  return [`M ${sourceX},${sourceY} C ${control1.x},${control1.y} ${control2.x},${control2.y} ${targetX},${targetY}`, label.x, label.y];
}

export function automationLaneEdgePath(sourceX: number, sourceY: number, targetX: number, targetY: number, lane: number, labelBias = 0.5): [string, number, number] {
  const controls = automationLaneEdgeControls(sourceX, sourceY, targetX, targetY, lane, labelBias);
  return [`M ${sourceX},${sourceY} C ${controls.control1.x},${controls.control1.y} ${controls.control2.x},${controls.control2.y} ${targetX},${targetY}`, controls.labelX, controls.labelY];
}

export function automationLaneEdgeControls(sourceX: number, sourceY: number, targetX: number, targetY: number, lane: number, labelBias = 0.5): { control1: { x: number; y: number }; control2: { x: number; y: number }; labelX: number; labelY: number } {
  const dx = targetX - sourceX;
  const distance = Math.max(1, Math.abs(dx));
  const horizontal = dx > 0 ? Math.min(210, Math.max(44, dx * 0.42), Math.max(36, dx * 0.52)) : Math.min(160, Math.max(72, distance * 0.28));
  const control1 = { x: sourceX + horizontal, y: sourceY + lane * 0.62 };
  const control2 = { x: targetX - horizontal, y: targetY + lane * 0.62 };
  const label = automationCubicPoint({ x: sourceX, y: sourceY }, control1, control2, { x: targetX, y: targetY }, labelBias);
  return { control1, control2, labelX: label.x, labelY: label.y };
}

export function automationCubicPoint(source: { x: number; y: number }, control1: { x: number; y: number }, control2: { x: number; y: number }, target: { x: number; y: number }, t: number): { x: number; y: number } {
  const u = 1 - t;
  return { x: u ** 3 * source.x + 3 * u ** 2 * t * control1.x + 3 * u * t ** 2 * control2.x + t ** 3 * target.x, y: u ** 3 * source.y + 3 * u ** 2 * t * control1.y + 3 * u * t ** 2 * control2.y + t ** 3 * target.y };
}

export function stableHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return hash;
}
