// Where the editor marks a loaded graph's start: on the main path's root, by
// Core's start rule, never on a Handler that no route enters (and so would be
// a root too); a graph with no Handler keeps the first-node fallback.
import { describe, expect, it } from "vitest";
import { WORKED_EXAMPLE, workedExampleGraph, workedExampleNodeId } from "../../../graph/handlers/tests/worked-example-graphs";
import { automationFlowGraphProblems } from "../../graph-validation";
import { taskFlowToEditorGraph } from "../flow-graph";

describe("the start of a loaded graph", () => {
  it("is the main path's root when the graph holds a Handler listed first", () => {
    for (const example of [WORKED_EXAMPLE.alternative, WORKED_EXAMPLE.checkpoint]) {
      const saved = workedExampleGraph(example);
      expect(saved.flow.nodes[0].definitionId).toBe("builtin.control.handler");
      const { nodes, edges } = taskFlowToEditorGraph(saved.flow);
      expect(nodes.filter((node) => node.data.isStart).map((node) => node.id)).toEqual([workedExampleNodeId(saved, "s1")]);
      // So the validator finds one start and nothing unreachable.
      expect(automationFlowGraphProblems(nodes, edges).filter((problem) => problem.id.startsWith("start:") || problem.id.startsWith("unreachable:"))).toEqual([]);
    }
  });

  it("keeps the first node for a graph with no Handler", () => {
    const saved = workedExampleGraph(WORKED_EXAMPLE.entry);
    const { nodes } = taskFlowToEditorGraph(saved.flow);
    expect(nodes.filter((node) => node.data.isStart).map((node) => node.id)).toEqual([saved.flow.nodes[0].id]);
  });
});
