import { describe, expect, it } from "vitest";
import { chooseAutomationStudioStartNode } from "../index.ts";
import { ACTION, START, END, actionNode, startNode, successEdge, flowOf, recordedChain, recordedId, inIdOrder, twelveFrom, handlerParts } from "./start-node-fixtures.ts";

describe("the id order a graph's nodes come back in", () => {
it("lists entry.1 first for entry.1 to entry.12, because '.' sorts before a digit, and a later node first for the other chains below", () => {
    expect(recordedChain(twelveFrom(1)).flow.nodes[0]?.id).toBe(recordedId(1));
    expect(recordedChain(twelveFrom(2)).flow.nodes[0]?.id).toBe(recordedId(10));
    expect(recordedChain([4, 8, 13, 14, 19]).flow.nodes[0]?.id).toBe(recordedId(13));
  });
});

describe("a graph run with no named start node", () => {
it("begins at an End node when no other node could begin the run", () => {
    expect(chooseAutomationStudioStartNode(flowOf([{ id: "done", definitionId: END }], []))).toMatchObject({ status: "root", node: { id: "done" } });
  });

it("names at most five of the roots it refuses", () => {
    const flow = flowOf(["r1", "r2", "r3", "r4", "r5", "r6", "r7"].map(actionNode), []);
    expect(chooseAutomationStudioStartNode(flow).message).toContain("7 nodes have no edge into them (r1, r2, r3, r4, r5, and 2 more)");
  });

it("counts neither a node's edge to itself nor an edge from a node the graph lacks as an edge into it", () => {
    // The id sort lists `a.next` first; the root is `z.retry`.
    const flow = flowOf(inIdOrder([actionNode("z.retry"), actionNode("a.next")]), [
      { id: "z.retry.again", sourceNodeId: "z.retry", sourcePortId: "failed", targetNodeId: "z.retry" },
      { id: "removed.z.retry", sourceNodeId: "removed-node", sourcePortId: "success", targetNodeId: "z.retry" },
      successEdge("z.retry", "a.next")
    ]);
    expect(chooseAutomationStudioStartNode(flow)).toMatchObject({ status: "root", node: { id: "z.retry" } });
  });

it("begins at the one Start node a graph declares, even beside a node no edge enters", () => {
    const flow = flowOf(inIdOrder([actionNode("a.orphan"), actionNode("b.work"), startNode("s.start")]), [successEdge("s.start", "b.work")]);
    expect(chooseAutomationStudioStartNode(flow)).toMatchObject({ status: "declared", node: { id: "s.start" } });
  });
});

describe("a graph that holds handlers", () => {
it("keeps a declared Start node beside a Handler", () => {
    const parts = handlerParts("handler.a");
    const flow = flowOf([...parts.nodes, startNode("start"), actionNode("work")], [...parts.edges, successEdge("start", "work")]);
    expect(chooseAutomationStudioStartNode(flow)).toMatchObject({ status: "declared", node: { id: "start" } });
  });

it("still refuses two real roots beside a Handler, naming only the real ones", () => {
    const parts = handlerParts("handler.a");
    const flow = flowOf([...parts.nodes, actionNode("x"), actionNode("y")], parts.edges);
    expect(chooseAutomationStudioStartNode(flow)).toMatchObject({ status: "several_roots", message: expect.stringContaining("2 nodes have no edge into them (x, y)") });
  });
});
