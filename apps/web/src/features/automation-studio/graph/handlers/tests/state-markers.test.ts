// Entries, checkpoints and the default start, as Core's start rule and
// Subflow contract read them, with Handlers never where a run begins.
import { describe, expect, it } from "vitest";
import { WORKED_EXAMPLE, workedExampleGraph, workedExampleNodeId } from "./worked-example-graphs";
import { flowHandlerBodies } from "../registrations";
import { handlerGraphFromSavedFlow } from "../source-graph";
import { flowDefaultStartNodeId, flowStateMarkers } from "../state-markers";
import type { HandlerGraph } from "../types";

function areaOf(graph: HandlerGraph): Set<string> {
  const area = new Set<string>();
  for (const [handlerId, body] of flowHandlerBodies(graph)) {
    area.add(handlerId);
    for (const step of body.steps) area.add(step);
  }
  return area;
}

describe("entry and checkpoint markers", () => {
  it("marks the alternative start with its condition", () => {
    const saved = workedExampleGraph(WORKED_EXAMPLE.entry);
    const markers = flowStateMarkers(handlerGraphFromSavedFlow(saved.flow)!);
    expect([...markers.keys()]).toEqual([workedExampleNodeId(saved, "s3")]);
    expect(markers.get(workedExampleNodeId(saved, "s3"))).toEqual([{ kind: "entry", id: "renew", order: 1, when: [{ fact: "exists", op: "exists", target: { handle: "t6" } }] }]);
  });

  it("marks a checkpoint", () => {
    const saved = workedExampleGraph(WORKED_EXAMPLE.checkpoint);
    expect(flowStateMarkers(handlerGraphFromSavedFlow(saved.flow)!).get(workedExampleNodeId(saved, "s2"))).toEqual([{ kind: "checkpoint", id: "search", when: [] }]);
  });

  it("leaves out a declaration Core could not read", () => {
    const graph: HandlerGraph = { graphId: "g", name: "", edges: [], nodes: [{ id: "a", label: "a", parameterValues: {}, metadata: { "fluxiq.entry": { order: 1 }, "fluxiq.checkpoint": { id: "x", when: "always" } } }] };
    expect(flowStateMarkers(graph).size).toBe(0);
  });
});

describe("the default start", () => {
  it("is the main path's root, not a Handler that no route enters", () => {
    for (const example of [WORKED_EXAMPLE.alternative, WORKED_EXAMPLE.checkpoint]) {
      const saved = workedExampleGraph(example);
      const graph = handlerGraphFromSavedFlow(saved.flow)!;
      expect(flowDefaultStartNodeId(graph, areaOf(graph))).toBe(workedExampleNodeId(saved, "s1"));
    }
  });

  it("is the one Start node, and nothing when several roots leave it open", () => {
    const graph: HandlerGraph = {
      graphId: "g",
      name: "",
      nodes: [{ id: "a", label: "a", parameterValues: {}, metadata: {} }, { id: "b", label: "b", parameterValues: {}, metadata: {} }],
      edges: []
    };
    expect(flowDefaultStartNodeId(graph)).toBeUndefined();
    expect(flowDefaultStartNodeId({ ...graph, nodes: [...graph.nodes, { id: "s", label: "Start", definitionId: "builtin.control.start", parameterValues: {}, metadata: {} }] })).toBe("s");
  });
});
