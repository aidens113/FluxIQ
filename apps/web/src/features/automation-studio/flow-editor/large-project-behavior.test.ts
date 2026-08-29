import { describe, expect, it } from "vitest";
import { createLargeAutomationStudioProjectFixture } from "../testing/large-project-fixture";
import { taskFlowToEditorGraph } from "./model/flow-graph";

describe("Flow Editor large-project behavior", () => {
  it("converts empty and thousands-node graph documents deterministically", () => {
    expect(taskFlowToEditorGraph({ nodes: [], edges: [] })).toEqual({ nodes: [], edges: [] });

    const fixture = createLargeAutomationStudioProjectFixture();
    const flow = {
      flowId: "flow.large-graph",
      nodes: fixture.actions.slice(0, 2_048).map((action, index) => ({
        id: action.nodeId,
        definitionId: index === 0 ? "builtin.control.start" : "builtin.control.noop",
        label: `Node ${index}`,
        position: { x: (index % 64) * 240, y: Math.floor(index / 64) * 140 }
      })),
      edges: []
    };
    const graph = taskFlowToEditorGraph(flow);
    expect(graph.nodes).toHaveLength(2_048);
    expect(graph.edges).toEqual([]);
    expect(graph.nodes[0]).toMatchObject({ id: "node.00000", position: { x: 0, y: 0 } });
    expect(graph.nodes.at(-1)).toMatchObject({ id: "node.02047", position: { x: 15_120, y: 4_340 } });
  });
});
