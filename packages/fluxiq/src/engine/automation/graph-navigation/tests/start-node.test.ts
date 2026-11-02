import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument } from "../../../../flows/executable/graph/index.ts";
import { chooseAutomationStudioStartNode, runAutomationStudioGraph } from "../../index.ts";
import { ACTION, START, END, actionNode, startNode, successEdge, flowOf, recordedChain, recordedId, inIdOrder, twelveFrom, handlerParts } from "../../../../flows/executable/graph/tests/start-node-fixtures.ts";

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

it("refuses, before any node runs, a graph with no Start node where every node has an edge into it from another", async () => {
    const flow = flowOf(["loop.a", "loop.b", "loop.c"].map(actionNode), [successEdge("loop.a", "loop.b"), successEdge("loop.b", "loop.c"), successEdge("loop.c", "loop.a")]);
    expect(chooseAutomationStudioStartNode(flow).status).toBe("no_root");
    const { trace, dispatched } = await runWithoutNamedStart(flow);
    expect(trace.status).toBe("failed");
    expect(trace.attempts).toEqual([]);
    expect(dispatched).toBe(0);
    expect(trace.message).toBe("This Flow has no Start node, and every node has an edge into it from another node, so no node is where a run begins. Add a Start node.");
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

describe("a graph that holds handlers", () => {
it("chooses the start it would without them: a Handler and its body are never roots", async () => {
    const one = handlerParts("handler.a");
    const two = handlerParts("handler.b");
    const flow = flowOf(inIdOrder([...one.nodes, ...two.nodes, actionNode("z.first"), actionNode("z.second")]), [...one.edges, ...two.edges, successEdge("z.first", "z.second")]);
    expect(flow.nodes[0]?.id).toBe("handler.a");
    expect(chooseAutomationStudioStartNode(flow)).toMatchObject({ status: "root", node: { id: "z.first" } });
    const { trace, dispatched } = await runWithoutNamedStart(flow);
    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.map((attempt) => attempt.nodeId)).toEqual(["z.first", "z.second"]);
    expect(dispatched).toBe(2);
  });
});
