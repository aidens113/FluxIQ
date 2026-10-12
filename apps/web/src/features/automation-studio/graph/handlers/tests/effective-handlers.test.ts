// The editor's mirror of Core's handler scope resolution (C4): node -> this
// part -> parts that call it (inheriting ones only, nearer first at equal
// order) -> whole automation; ascending order, then document order; nothing
// inside a handler.
import { describe, expect, it } from "vitest";
import { WORKED_EXAMPLE, workedExampleGraph, workedExampleNodeId } from "./worked-example-graphs";
import { resolveEffectiveFlowHandlers } from "../effective-handlers";
import { handlerGraphFromSavedFlow } from "../source-graph";
import type { HandlerGraph, HandlerGraphNode } from "../types";

function handler(id: string, event: string, scope: Record<string, unknown>, order = 0): HandlerGraphNode {
  return { id, label: id, definitionId: "builtin.control.handler", parameterValues: { event, scope, order }, metadata: {} };
}

function step(id: string, metadata: Record<string, unknown> = {}): HandlerGraphNode {
  return { id, label: id, definitionId: "web.output.dom-click", parameterValues: {}, metadata };
}

function graph(graphId: string, nodes: HandlerGraphNode[], edges: Array<[string, string, string]> = []): HandlerGraph {
  return { graphId, name: graphId, nodes, edges: edges.map(([source, sourcePort, target], index) => ({ id: `${graphId}-e${index}`, source, sourcePort, target })) };
}

const order = (graphs: Parameters<typeof resolveEffectiveFlowHandlers>[0], nodeId: string) =>
  resolveEffectiveFlowHandlers(graphs, nodeId).map((entry) => `${entry.registration.event} ${entry.level} ${entry.registration.handlerId}`);

describe("effective handlers, in the order the run tries them", () => {
  const current = graph("part", [
    step("a"),
    step("b"),
    step("clear", { clearsInterference: true }),
    handler("late", "fail", { kind: "nodes", nodeIds: ["a"] }, 2),
    handler("early", "fail", { kind: "nodes", nodeIds: ["a", "b"] }, 1),
    handler("here", "fail", { kind: "subflow" }),
    handler("next", "before_next", { kind: "subflow" }),
    handler("prior", "before", { kind: "nodes", nodeIds: ["a"] })
  ], [["a", "failed", "b"]]);
  const near = graph("near", [handler("near-kept", "fail", { kind: "subflow", inherit: true }), handler("near-closed", "fail", { kind: "subflow", inherit: false })]);
  const far = graph("far", [handler("far-kept", "fail", { kind: "subflow" })]);
  const recovery = graph("recovery", [handler("everywhere", "fail", { kind: "automation" }), handler("guard", "before", { kind: "automation" })]);

  it("groups by event, then node, this part, calling parts nearest first, the whole automation", () => {
    expect(order({ current, callers: [near, far], automation: [recovery] }, "a")).toEqual([
      "before node part/prior",
      "before automation recovery/guard",
      "retry automation part/clear#clears_interference",
      "fail node part/early",
      "fail node part/late",
      "fail node part/part-e0",
      "fail subflow part/here",
      "fail ancestor near/near-kept",
      "fail ancestor far/far-kept",
      "fail automation recovery/everywhere",
      "before_next subflow part/next"
    ]);
  });

  it("never offers a node that clears interference as its own interference handler", () => {
    expect(order({ current }, "clear").filter((line) => line.startsWith("retry"))).toEqual([]);
  });

  it("offers nothing inside a Handler or its body", () => {
    const withBody = graph("part", [step("a"), handler("h", "fail", { kind: "subflow" }), step("x"), { ...step("end"), definitionId: "builtin.control.handler-end" }], [["h", "body", "x"], ["x", "success", "end"]]);
    expect(order({ current: withBody }, "h")).toEqual([]);
    expect(order({ current: withBody }, "x")).toEqual([]);
    expect(order({ current: withBody }, "a")).toEqual(["fail subflow part/h"]);
  });

  it("finds the second known way's failure handler on the step it covers", () => {
    const saved = workedExampleGraph(WORKED_EXAMPLE.alternative);
    const read = handlerGraphFromSavedFlow(saved.flow)!;
    const [only, ...rest] = resolveEffectiveFlowHandlers({ current: read }, workedExampleNodeId(saved, "s2"));
    expect(rest).toEqual([]);
    expect(only).toMatchObject({ level: "node", registration: { event: "fail", source: { nodeId: workedExampleNodeId(saved, "h1-s1") } } });
    expect(resolveEffectiveFlowHandlers({ current: read }, workedExampleNodeId(saved, "s1"))).toEqual([]);
  });

  it("finds the interruption example's whole-automation handler from a step of the main part", () => {
    const main = workedExampleGraph(WORKED_EXAMPLE.interruption);
    const recoveryPart = workedExampleGraph(WORKED_EXAMPLE.interruption, "recovery");
    const effective = resolveEffectiveFlowHandlers({ current: handlerGraphFromSavedFlow(main.flow)!, automation: [handlerGraphFromSavedFlow(recoveryPart.flow, "recovery")!] }, workedExampleNodeId(main, "s5"));
    expect(effective.map((entry) => [entry.registration.event, entry.level, entry.graphId])).toEqual([["before", "automation", recoveryPart.flow.flowId]]);
  });
});
