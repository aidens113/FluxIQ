import type { Node } from "@xyflow/react";
import { describe, expect, it, vi } from "vitest";
import {
  createFlowCanvasInteractionController,
  type FlowCanvasFrameScheduler
} from "./flow-canvas-interaction-controller";
import type { AutomationFlowNodeData } from "./node-types";

type FlowNode = Node<AutomationFlowNodeData>;

function node(id: string, x: number, y: number): FlowNode {
  return {
    id,
    position: { x, y },
    measured: { width: 20, height: 20 },
    data: {} as AutomationFlowNodeData
  };
}

function frameScheduler() {
  let nextHandle = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  const scheduler: FlowCanvasFrameScheduler = {
    request(callback) {
      const handle = nextHandle++;
      callbacks.set(handle, callback);
      return handle;
    },
    cancel(handle) {
      callbacks.delete(handle);
    }
  };
  return {
    scheduler,
    pending: () => callbacks.size,
    flush() {
      const pending = [...callbacks.values()];
      callbacks.clear();
      pending.forEach((callback) => callback(0));
    }
  };
}

function controllerFixture(nodes: FlowNode[]) {
  const frames = frameScheduler();
  const previewNodes = vi.fn();
  const renderMarquee = vi.fn();
  const renderHover = vi.fn();
  const renderViewport = vi.fn();
  const settleNodeDrag = vi.fn();
  const settleMarquee = vi.fn();
  const controller = createFlowCanvasInteractionController({
    scheduler: frames.scheduler,
    getNodes: () => nodes,
    screenToFlowPosition: (point) => point,
    previewNodes,
    renderMarquee,
    renderHover,
    renderViewport,
    settleNodeDrag,
    settleMarquee
  });
  return {
    controller,
    frames,
    previewNodes,
    renderMarquee,
    renderHover,
    renderViewport,
    settleNodeDrag,
    settleMarquee
  };
}

describe("Flow canvas interaction controller", () => {
  it("coalesces raw node movement and commits only after drag settlement", () => {
    const fixture = controllerFixture([node("a", 0, 0)]);
    fixture.controller.beginNodeDrag();
    fixture.controller.previewNodeChanges([{
      type: "position",
      id: "a",
      position: { x: 10, y: 5 },
      dragging: true
    }]);
    fixture.controller.previewNodeChanges([{
      type: "position",
      id: "a",
      position: { x: 30, y: 15 },
      dragging: true
    }]);

    expect(fixture.frames.pending()).toBe(1);
    expect(fixture.previewNodes).not.toHaveBeenCalled();
    expect(fixture.settleNodeDrag).not.toHaveBeenCalled();

    fixture.frames.flush();
    expect(fixture.previewNodes).toHaveBeenCalledTimes(1);
    expect(fixture.previewNodes.mock.calls[0]?.[0]?.[0]?.position)
      .toEqual({ x: 30, y: 15 });
    expect(fixture.settleNodeDrag).not.toHaveBeenCalled();

    fixture.controller.settleNodeDrag([node("a", 42, 21)]);
    expect(fixture.settleNodeDrag).toHaveBeenCalledTimes(1);
    expect(fixture.settleNodeDrag.mock.calls[0]?.[0]?.[0]?.position)
      .toEqual({ x: 42, y: 21 });
  });

  it("renders right-drag marquee once per frame and selects only on release", () => {
    const fixture = controllerFixture([
      node("inside", 20, 20),
      node("outside", 200, 200)
    ]);
    fixture.controller.startMarquee({
      pointerId: 7,
      point: { x: 10, y: 10 },
      frameLeft: 5,
      frameTop: 5
    });
    fixture.controller.moveMarquee(7, { x: 40, y: 50 });
    fixture.controller.moveMarquee(7, { x: 100, y: 110 });

    expect(fixture.frames.pending()).toBe(1);
    expect(fixture.renderMarquee).not.toHaveBeenCalled();
    expect(fixture.settleMarquee).not.toHaveBeenCalled();

    fixture.frames.flush();
    expect(fixture.renderMarquee).toHaveBeenCalledTimes(1);
    expect(fixture.renderMarquee).toHaveBeenLastCalledWith({
      left: 5,
      top: 5,
      width: 90,
      height: 100
    });

    fixture.controller.settleMarquee(7, { x: 120, y: 120 });
    expect(fixture.settleMarquee).toHaveBeenCalledTimes(1);
    expect(fixture.settleMarquee.mock.calls[0]?.[0]?.map((item: FlowNode) => item.id))
      .toEqual(["inside"]);
    expect(fixture.renderMarquee).toHaveBeenLastCalledWith(null);
  });

  it("reserves a stationary right click without changing selection", () => {
    const fixture = controllerFixture([node("a", 0, 0)]);
    fixture.controller.startMarquee({
      pointerId: 3,
      point: { x: 10, y: 10 },
      frameLeft: 0,
      frameTop: 0
    });
    fixture.controller.settleMarquee(3, { x: 12, y: 11 });

    expect(fixture.settleMarquee).not.toHaveBeenCalled();
    expect(fixture.renderMarquee).toHaveBeenLastCalledWith(null);
  });

  it("coalesces hover and viewport previews without graph commits", () => {
    const fixture = controllerFixture([node("a", 0, 0)]);
    fixture.controller.previewHover("a");
    fixture.controller.previewHover(null);
    fixture.controller.previewViewport({ x: 1, y: 2, zoom: 1 });
    fixture.controller.previewViewport({ x: 5, y: 8, zoom: 1.5 });

    expect(fixture.frames.pending()).toBe(1);
    fixture.frames.flush();
    expect(fixture.renderHover).toHaveBeenCalledTimes(1);
    expect(fixture.renderHover).toHaveBeenCalledWith(null);
    expect(fixture.renderViewport).toHaveBeenCalledTimes(1);
    expect(fixture.renderViewport).toHaveBeenCalledWith({
      x: 5,
      y: 8,
      zoom: 1.5
    });
    expect(fixture.settleNodeDrag).not.toHaveBeenCalled();
    expect(fixture.settleMarquee).not.toHaveBeenCalled();
  });
});
