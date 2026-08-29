import type { Edge, Node, ReactFlowInstance } from "@xyflow/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { AutomationDragSelectBox } from "../workspace/layout";

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
  let animationFrame = 0;
  const flushDragBox = () => {
    animationFrame = 0;
    options.setDragBox(toBox(latest));
  };
  const scheduleDragBox = () => {
    if (!animationFrame) animationFrame = window.requestAnimationFrame(flushDragBox);
  };
  const onMove = (moveEvent: PointerEvent) => {
    latest = { x: moveEvent.clientX, y: moveEvent.clientY };
    scheduleDragBox();
  };
  const onUp = (upEvent: PointerEvent) => {
    latest = { x: upEvent.clientX, y: upEvent.clientY };
    if (animationFrame) {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    }
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
