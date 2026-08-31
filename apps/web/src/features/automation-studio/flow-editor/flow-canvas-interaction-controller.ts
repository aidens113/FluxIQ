import { applyNodeChanges, type Node, type NodeChange, type Viewport } from "@xyflow/react";
import type { AutomationFlowNodeData } from "./node-types";

type FlowNode = Node<AutomationFlowNodeData>;
type Point = { x: number; y: number };

export type FlowCanvasMarqueeBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type FlowCanvasFrameScheduler = {
  request(callback: FrameRequestCallback): number;
  cancel(handle: number): void;
};

export type FlowCanvasInteractionControllerOptions = {
  scheduler: FlowCanvasFrameScheduler;
  getNodes(): FlowNode[];
  screenToFlowPosition(point: Point): Point;
  previewNodes(nodes: FlowNode[]): void;
  renderMarquee(box: FlowCanvasMarqueeBox | null): void;
  renderHover(nodeId: string | null): void;
  renderViewport(viewport: Viewport): void;
  settleNodeDrag(nodes: FlowNode[]): void;
  settleMarquee(nodes: FlowNode[]): void;
};

type MarqueeGesture = {
  pointerId: number;
  start: Point;
  latest: Point;
  frameLeft: number;
  frameTop: number;
  nodes: FlowNode[];
  moved: boolean;
};

const marqueeMovementThreshold = 4;

export function createFlowCanvasInteractionController(
  options: FlowCanvasInteractionControllerOptions
) {
  let animationFrame = 0;
  let dragNodes: FlowNode[] | null = null;
  let pendingNodePreview: FlowNode[] | null = null;
  let marquee: MarqueeGesture | null = null;
  let pendingMarquee: FlowCanvasMarqueeBox | null | undefined;
  let pendingHover: string | null | undefined;
  let pendingViewport: Viewport | null = null;

  const flush = () => {
    animationFrame = 0;
    if (pendingNodePreview) {
      const nodes = pendingNodePreview;
      pendingNodePreview = null;
      options.previewNodes(nodes);
    }
    if (pendingMarquee !== undefined) {
      const box = pendingMarquee;
      pendingMarquee = undefined;
      options.renderMarquee(box);
    }
    if (pendingHover !== undefined) {
      const nodeId = pendingHover;
      pendingHover = undefined;
      options.renderHover(nodeId);
    }
    if (pendingViewport) {
      const viewport = pendingViewport;
      pendingViewport = null;
      options.renderViewport(viewport);
    }
  };

  const schedule = () => {
    if (!animationFrame) animationFrame = options.scheduler.request(flush);
  };

  const flushNow = () => {
    if (animationFrame) {
      options.scheduler.cancel(animationFrame);
      animationFrame = 0;
    }
    flush();
  };

  return {
    beginNodeDrag() {
      dragNodes = options.getNodes();
      pendingNodePreview = null;
    },

    previewNodeChanges(changes: Array<NodeChange<FlowNode>>) {
      if (!dragNodes) return false;
      dragNodes = applyNodeChanges(changes, dragNodes);
      pendingNodePreview = dragNodes;
      schedule();
      return true;
    },

    settleNodeDrag(settledNodes: FlowNode[] = []) {
      if (!dragNodes) return false;
      if (settledNodes.length) dragNodes = mergeSettledNodePositions(dragNodes, settledNodes);
      pendingNodePreview = dragNodes;
      flushNow();
      const nodes = dragNodes;
      dragNodes = null;
      options.settleNodeDrag(nodes);
      return true;
    },

    startMarquee(input: {
      pointerId: number;
      point: Point;
      frameLeft: number;
      frameTop: number;
    }) {
      marquee = {
        pointerId: input.pointerId,
        start: input.point,
        latest: input.point,
        frameLeft: input.frameLeft,
        frameTop: input.frameTop,
        nodes: options.getNodes(),
        moved: false
      };
      return true;
    },

    moveMarquee(pointerId: number, point: Point) {
      if (!marquee || marquee.pointerId !== pointerId) return false;
      marquee.latest = point;
      marquee.moved = marquee.moved
        || distance(marquee.start, point) >= marqueeMovementThreshold;
      if (marquee.moved) {
        pendingMarquee = marqueeBox(marquee);
        schedule();
      }
      return true;
    },

    settleMarquee(pointerId: number, point: Point) {
      if (!marquee || marquee.pointerId !== pointerId) return false;
      marquee.latest = point;
      marquee.moved = marquee.moved
        || distance(marquee.start, point) >= marqueeMovementThreshold;
      const gesture = marquee;
      marquee = null;
      if (!gesture.moved) {
        pendingMarquee = null;
        flushNow();
        return true;
      }
      pendingMarquee = marqueeBox(gesture);
      flushNow();
      const selectedIds = nodesInScreenRect(
        gesture.nodes,
        options.screenToFlowPosition,
        gesture.start,
        gesture.latest
      );
      options.settleMarquee(
        gesture.nodes.filter((node) => selectedIds.has(node.id))
      );
      options.renderMarquee(null);
      return true;
    },

    cancelMarquee(pointerId?: number) {
      if (!marquee
        || (pointerId !== undefined && marquee.pointerId !== pointerId)) return false;
      marquee = null;
      pendingMarquee = null;
      flushNow();
      return true;
    },

    previewHover(nodeId: string | null) {
      pendingHover = nodeId;
      schedule();
    },

    previewViewport(viewport: Viewport) {
      pendingViewport = viewport;
      schedule();
    },

    flush: flushNow,

    dispose() {
      if (animationFrame) options.scheduler.cancel(animationFrame);
      animationFrame = 0;
      dragNodes = null;
      pendingNodePreview = null;
      marquee = null;
      pendingMarquee = undefined;
      pendingHover = undefined;
      pendingViewport = null;
      options.renderMarquee(null);
      options.renderHover(null);
    }
  };
}

export type FlowCanvasInteractionController = ReturnType<
  typeof createFlowCanvasInteractionController
>;

function marqueeBox(gesture: MarqueeGesture): FlowCanvasMarqueeBox {
  return {
    left: Math.min(gesture.start.x, gesture.latest.x) - gesture.frameLeft,
    top: Math.min(gesture.start.y, gesture.latest.y) - gesture.frameTop,
    width: Math.abs(gesture.latest.x - gesture.start.x),
    height: Math.abs(gesture.latest.y - gesture.start.y)
  };
}

function distance(start: Point, end: Point): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

function mergeSettledNodePositions(
  nodes: FlowNode[],
  settledNodes: FlowNode[]
): FlowNode[] {
  const positions = new Map(settledNodes.map((node) => [node.id, node.position]));
  return nodes.map((node) => {
    const position = positions.get(node.id);
    return position
      && (position.x !== node.position.x || position.y !== node.position.y)
      ? { ...node, position }
      : node;
  });
}

function nodesInScreenRect(
  nodes: FlowNode[],
  screenToFlowPosition: (point: Point) => Point,
  start: Point,
  end: Point
): Set<string> {
  const startFlow = screenToFlowPosition(start);
  const endFlow = screenToFlowPosition(end);
  const rect = {
    left: Math.min(startFlow.x, endFlow.x),
    top: Math.min(startFlow.y, endFlow.y),
    right: Math.max(startFlow.x, endFlow.x),
    bottom: Math.max(startFlow.y, endFlow.y)
  };
  return new Set(nodes.filter((node) => {
    const width = typeof node.measured?.width === "number"
      ? node.measured.width
      : 280;
    const height = typeof node.measured?.height === "number"
      ? node.measured.height
      : 196;
    const nodeRect = {
      left: node.position.x,
      top: node.position.y,
      right: node.position.x + width,
      bottom: node.position.y + height
    };
    return rect.left <= nodeRect.right
      && rect.right >= nodeRect.left
      && rect.top <= nodeRect.bottom
      && rect.bottom >= nodeRect.top;
  }).map((node) => node.id));
}
