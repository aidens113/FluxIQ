// The Handlers area sits apart from the main path: a loaded graph whose
// Handlers overlap it has them moved below, and one already clear keeps its
// positions.
import type { Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";
import { flowHandlerAreaBounds, separateFlowHandlerArea } from "../area-layout";

const at = (id: string, x: number, y: number): Node<Record<string, unknown>> => ({ id, position: { x, y }, data: {} });

describe("the Handlers area layout", () => {
  const bodies = new Map([["h", ["x", "end"]]]);

  it("moves Handlers that overlap the main path into a band below it, one row per Handler", () => {
    const nodes = [at("h", 0, 0), at("s1", 0, 180), at("x", 320, 0), at("s2", 320, 180), at("end", 640, 0)];
    const moved = separateFlowHandlerArea(nodes, bodies);
    const position = (id: string) => moved.find((node) => node.id === id)!.position;
    expect(position("s1")).toEqual({ x: 0, y: 180 });
    expect(position("s2")).toEqual({ x: 320, y: 180 });
    const mainBottom = 180 + 400;
    expect(position("h").y).toBeGreaterThan(mainBottom);
    expect([position("h").y, position("x").y, position("end").y]).toEqual([position("h").y, position("h").y, position("h").y]);
    expect(position("x").x).toBeGreaterThan(position("h").x);
    expect(position("end").x).toBeGreaterThan(position("x").x);
  });

  it("keeps positions a person already put clear of the main path", () => {
    const nodes = [at("s1", 0, 0), at("h", 0, 2000), at("x", 400, 2000), at("end", 800, 2000)];
    expect(separateFlowHandlerArea(nodes, bodies)).toBe(nodes);
  });

  it("outlines every node in the area, with room for its heading", () => {
    const bounds = flowHandlerAreaBounds([at("h", 0, 1000), at("x", 400, 1000), at("s1", 0, 0)], new Set(["h", "x"]))!;
    expect(bounds.x).toBeLessThan(0);
    expect(bounds.y).toBeLessThan(1000);
    expect(bounds.y).toBeGreaterThan(400);
    expect(bounds.width).toBeGreaterThan(680);
    expect(flowHandlerAreaBounds([at("s1", 0, 0)], new Set())).toBeNull();
  });
});
