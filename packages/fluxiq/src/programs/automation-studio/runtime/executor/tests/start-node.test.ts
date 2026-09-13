import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../model/index.ts";
import { chooseAutomationStudioStartNode, runAutomationStudioGraph } from "../index.ts";

// Where a run of a graph begins when its caller names no node. The project graph
// index hands a Flow's nodes back `order by node_id`, and a recorded node's id
// carries its unpadded timeline number. Every row lists its nodes in that binary
// id order, so a rule that took the first listed node would begin wherever the
// sort put it rather than where the graph does.

const ACTION = "builtin.policy.action";
const START = "builtin.control.start";
const END = "builtin.control.end";

/** The id a recorded node gets for a candidate at timeline entry `entry`: `recorded.candidate.entry.<N>.<uuid>`. */
function recordedId(entry: number): string {
  return `recorded.candidate.entry.${entry}.4f1c2d3e-0000-4000-8000-${String(entry).padStart(12, "0")}`;
}

/** The nodes as `order by node_id` returns them: a binary comparison of the id text. */
function inIdOrder<T extends { id: string }>(nodes: readonly T[]): T[] {
  return [...nodes].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

function actionNode(id: string): AutomationStudioFlowNode {
  return { id, definitionId: ACTION, parameterValues: { outputId: "click", parameters: {} } };
}

function startNode(id: string): AutomationStudioFlowNode {
  return { id, definitionId: START };
}

function successEdge(sourceNodeId: string, targetNodeId: string): AutomationStudioFlowEdge {
  return { id: `${sourceNodeId}->${targetNodeId}`, sourceNodeId, targetNodeId, sourcePortId: "success", targetPortId: "ready" };
}

function flowOf(nodes: AutomationStudioFlowNode[], edges: AutomationStudioFlowEdge[]): AutomationStudioFlowDocument {
  return { schemaVersion: "0.1", flowId: "flow.start-node", ownerKind: "routine", ownerId: "routine.start-node", name: "Start node", createdAt: 1, updatedAt: 1, nodes, edges };
}

/** Recorded action nodes at these timeline entries, linked by success edges in the order given, and listed in id order. */
function recordedChain(entries: readonly number[]): { flow: AutomationStudioFlowDocument; chain: string[] } {
  const chain = entries.map(recordedId);
  return { chain, flow: flowOf(inIdOrder(chain.map(actionNode)), chain.slice(1).map((id, index) => successEdge(chain[index]!, id))) };
}

/** Runs the graph with no named start, counting every effect it dispatches. */
async function runWithoutNamedStart(flow: AutomationStudioFlowDocument) {
  let dispatched = 0;
  const trace = await runAutomationStudioGraph(flow, {
    effectDispatcher: () => {
      dispatched += 1;
      return { status: "success", route: "success", outputs: {} };
    }
  });
  return { trace, dispatched };
}

const twelveFrom = (first: number): number[] => Array.from({ length: 12 }, (_, index) => first + index);

describe("the id order a graph's nodes come back in", () => {
  it("lists entry.1 first for entry.1 to entry.12, because '.' sorts before a digit, and a later node first for the other chains below", () => {
    expect(recordedChain(twelveFrom(1)).flow.nodes[0]?.id).toBe(recordedId(1));
    expect(recordedChain(twelveFrom(2)).flow.nodes[0]?.id).toBe(recordedId(10));
    expect(recordedChain([4, 8, 13, 14, 19]).flow.nodes[0]?.id).toBe(recordedId(13));
  });
});

describe("a graph run with no named start node", () => {
  it.each([
    ["twelve nodes, entry.1 to entry.12", twelveFrom(1)],
    ["twelve nodes, entry.2 to entry.13, which the id sort lists from entry.10", twelveFrom(2)],
    ["W15's shape, entries 4, 8, 13, 14 and 19, which the id sort lists from entry.13", [4, 8, 13, 14, 19]]
  ])("begins a recorded chain at its first node and runs it in chain order: %s", async (_shape, entries) => {
    const { flow, chain } = recordedChain(entries);
    expect(chooseAutomationStudioStartNode(flow)).toMatchObject({ status: "root", node: { id: chain[0] } });
    const { trace, dispatched } = await runWithoutNamedStart(flow);
    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(chain);
    expect(dispatched).toBe(chain.length);
  });

  it("refuses, before any node runs, a graph with no Start node and several nodes no edge enters, naming no unwired End node among them", async () => {
    const flow = flowOf(inIdOrder([...["chain-a.1", "chain-a.2", "chain-b.1", "chain-b.2"].map(actionNode), { id: "chain-done", definitionId: END }]), [successEdge("chain-a.1", "chain-a.2"), successEdge("chain-b.1", "chain-b.2")]);
    const choice = chooseAutomationStudioStartNode(flow);
    expect(choice.status).toBe("several_roots");
    expect(choice.node).toBeUndefined();
    const { trace, dispatched } = await runWithoutNamedStart(flow);
    expect(trace.status).toBe("failed");
    expect(trace.attempts).toEqual([]);
    expect(dispatched).toBe(0);
    expect(trace.message).toBe("This Flow has no Start node, and 2 nodes have no edge into them (chain-a.1, chain-b.1), so where a run begins is ambiguous. Add a Start node, or connect those nodes.");
  });

  it("does not begin at an End node no edge enters while another node could begin the run, though the id sort lists the End node first", async () => {
    // The shape an author leaves when the End node is not yet wired.
    const flow = flowOf(inIdOrder([actionNode("submit"), { id: "done", definitionId: END }]), []);
    expect(flow.nodes[0]?.id).toBe("done");
    expect(chooseAutomationStudioStartNode(flow)).toMatchObject({ status: "root", node: { id: "submit" } });
    const { trace, dispatched } = await runWithoutNamedStart(flow);
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["submit"]);
    expect(dispatched).toBe(1);
  });

  it("begins at an End node when no other node could begin the run", () => {
    expect(chooseAutomationStudioStartNode(flowOf([{ id: "done", definitionId: END }], []))).toMatchObject({ status: "root", node: { id: "done" } });
  });

  it("names at most five of the roots it refuses", () => {
    const flow = flowOf(["r1", "r2", "r3", "r4", "r5", "r6", "r7"].map(actionNode), []);
    expect(chooseAutomationStudioStartNode(flow).message).toContain("7 nodes have no edge into them (r1, r2, r3, r4, r5, and 2 more)");
  });

  it("refuses, before any node runs, a graph with no Start node where every node has an edge into it from another", async () => {
    const flow = flowOf(["loop.a", "loop.b", "loop.c"].map(actionNode), [successEdge("loop.a", "loop.b"), successEdge("loop.b", "loop.c"), successEdge("loop.c", "loop.a")]);
    expect(chooseAutomationStudioStartNode(flow).status).toBe("no_root");
    const { trace, dispatched } = await runWithoutNamedStart(flow);
    expect(trace.status).toBe("failed");
    expect(trace.attempts).toEqual([]);
    expect(dispatched).toBe(0);
    expect(trace.message).toBe("This Flow has no Start node, and every node has an edge into it from another node, so no node is where a run begins. Add a Start node.");
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

  it("refuses, before any node runs, a graph that declares several Start nodes", async () => {
    const flow = flowOf([startNode("start.one"), startNode("start.two"), actionNode("work")], [successEdge("start.one", "work"), successEdge("start.two", "work")]);
    expect(chooseAutomationStudioStartNode(flow).status).toBe("several_declared");
    const { trace, dispatched } = await runWithoutNamedStart(flow);
    expect(trace.status).toBe("failed");
    expect(trace.attempts).toEqual([]);
    expect(dispatched).toBe(0);
    expect(trace.message).toBe("This Flow has 2 Start nodes (start.one, start.two), so where a run begins is ambiguous. Keep one Start node.");
  });

  it("fails an empty graph with the message it always had", async () => {
    const flow = flowOf([], []);
    expect(chooseAutomationStudioStartNode(flow).status).toBe("empty");
    const { trace } = await runWithoutNamedStart(flow);
    expect(trace).toMatchObject({ status: "failed", attempts: [], message: "No start node is available in this flow." });
  });
});
