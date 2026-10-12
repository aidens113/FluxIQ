// The editor's mirror of Core's graph-registrations reader (C4): Handler nodes,
// authored failure routes and interference nodes read as registrations, in
// Core's document order, and each Handler's body read to its ends.
import { describe, expect, it } from "vitest";
import { WORKED_EXAMPLE, workedExampleGraph, workedExampleNodeId } from "./worked-example-graphs";
import { flowHandlerBodies, flowHandlerRegistrations } from "../registrations";
import { handlerGraphFromSavedFlow } from "../source-graph";
import type { HandlerGraph, HandlerGraphNode } from "../types";

function node(id: string, definitionId = "web.output.dom-click", parameterValues: Record<string, unknown> = {}, metadata: Record<string, unknown> = {}): HandlerGraphNode {
  return { id, label: id, definitionId, parameterValues, metadata };
}

function graph(nodes: HandlerGraphNode[], edges: Array<[string, string, string]>): HandlerGraph {
  return { graphId: "g", name: "Main", nodes, edges: edges.map(([source, sourcePort, target], index) => ({ id: `e${index}`, source, sourcePort, target })) };
}

describe("handler registrations, as Core reads them", () => {
  it("reads the checkpoint example's retry handler, scoped to its step, with its body and end", () => {
    const saved = workedExampleGraph(WORKED_EXAMPLE.checkpoint);
    const read = handlerGraphFromSavedFlow(saved.flow)!;
    const [registration, ...rest] = flowHandlerRegistrations(read);
    expect(rest).toEqual([]);
    expect(registration).toMatchObject({
      event: "retry",
      scope: { kind: "nodes", nodeIds: [workedExampleNodeId(saved, "s3")] },
      when: [{ fact: "exists", op: "exists", target: { handle: "t30" } }],
      completionCheck: [{ fact: "absent", op: "absent", target: { handle: "t30" } }],
      order: 1,
      maxRuns: 1,
      source: {
        kind: "handler_node",
        nodeId: workedExampleNodeId(saved, "h1-s1"),
        bodyNodeIds: [workedExampleNodeId(saved, "h1-s2"), workedExampleNodeId(saved, "h1-s3")],
        endNodeIds: [workedExampleNodeId(saved, "h1-s3")]
      }
    });
  });

  it("reads the whole-automation handler of the recovery part", () => {
    const recovery = handlerGraphFromSavedFlow(workedExampleGraph(WORKED_EXAMPLE.interruption, "recovery").flow, "recovery")!;
    expect(flowHandlerRegistrations(recovery).map((registration) => [registration.event, registration.scope.kind])).toEqual([["before", "automation"]]);
  });

  it("reads authored failure routes after Handlers, and interference nodes last, in Core's document order", () => {
    const read = graph([
      node("a"),
      node("b", "web.output.dom-click", {}, { clearsInterference: true }),
      node("h", "builtin.control.handler", { event: "fail", scope: { kind: "nodes", nodeIds: ["a"] }, order: 3 }),
      node("x"),
      node("end", "builtin.control.handler-end", { disposition: "unhandled" })
    ], [["a", "failed", "x"], ["a", "error.timeout", "b"], ["a", "success", "b"], ["h", "body", "x"], ["x", "success", "end"]]);
    expect(flowHandlerRegistrations(read).map((registration) => [registration.handlerId, registration.event, registration.scope.kind, registration.order, registration.source.kind])).toEqual([
      ["g/h", "fail", "nodes", 3, "handler_node"],
      ["g/e0", "fail", "nodes", Number.MAX_SAFE_INTEGER, "failed_edge"],
      ["g/e1", "fail", "nodes", Number.MAX_SAFE_INTEGER, "failed_edge"],
      ["g/b#clears_interference", "retry", "automation", 0, "clears_interference"]
    ]);
  });

  it("reads an optional step's way on in place of its failed edge", () => {
    const read = graph([node("a"), node("b"), node("join", "builtin.control.merge")], [["a", "success", "b"], ["b", "success", "join"], ["a", "failed", "join"]]);
    const [wayOn] = flowHandlerRegistrations(read);
    expect(wayOn?.source).toEqual({ kind: "failed_edge", nodeId: "a", edgeId: "e2", targetNodeId: "join", wayOn: true });
  });

  it("leaves out a Handler it cannot read, whose body still belongs to it", () => {
    const read = graph([
      node("h", "builtin.control.handler", { event: "sometime", scope: { kind: "subflow" } }),
      node("x"),
      node("end", "builtin.control.handler-end")
    ], [["h", "body", "x"], ["x", "success", "end"]]);
    expect(flowHandlerRegistrations(read)).toEqual([]);
    expect(flowHandlerBodies(read).get("h")).toEqual({ steps: ["x", "end"], ends: ["end"] });
  });

  it("refuses a condition list with any entry that is not a condition, as Core does", () => {
    const read = graph([node("h", "builtin.control.handler", { event: "fail", scope: { kind: "subflow" }, when: [{ fact: "exists", op: "exists" }, { fact: "", op: "exists" }] })], []);
    expect(flowHandlerRegistrations(read)).toEqual([]);
  });
});
