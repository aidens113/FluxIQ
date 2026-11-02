import { describe, expect, it } from "vitest";
import type { ExecutableFlow, ExecutableGraph } from "../../graph/index.ts";
import { validateExecutableFlow, validateExecutableGraph } from "../index.ts";

function handlerGraph(): ExecutableGraph {
  return {
    flowId: "isolated.graph",
    nodes: [
      { id: "handler", definitionId: "builtin.control.handler", parameterValues: { event: "fail", scope: { kind: "subflow" } } },
      { id: "end", definitionId: "builtin.control.handler-end", parameterValues: { disposition: "resolve", outputs: {} } }
    ],
    edges: [{ id: "body", sourceNodeId: "handler", targetNodeId: "end", sourcePortId: "body", targetPortId: "in" }]
  };
}

describe("actual executable graph validation", () => {
  it("uses the enclosing required outputs without a fabricated interface or scope", () => {
    const graph = handlerGraph();
    const before = JSON.stringify(graph);
    const issues = validateExecutableGraph(graph, { requiredSubflowOutputIds: ["result"] }).issues;
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "flow.handler_resolve_missing_outputs", path: "nodes.1.parameterValues.outputs" });
    expect(issues[0]?.message).toContain("result");
    expect(JSON.stringify(graph)).toBe(before);
    expect(Object.keys(graph).sort()).toEqual(["edges", "flowId", "nodes"]);
  });

  it("keeps graph issues byte-identical in full Flow validation using its actual output contract", () => {
    const graph = handlerGraph();
    const flow: ExecutableFlow = {
      ...graph, name: "Actual enclosing contract", scope: { kind: "global" },
      interface: { inputs: [], outputs: [{ id: "result", name: "Result", valueType: { kind: "string" }, required: true }] },
      errors: [], variables: []
    };
    expect(validateExecutableFlow(flow)).toEqual(validateExecutableGraph(graph, { requiredSubflowOutputIds: ["result"] }));
    expect(validateExecutableGraph(graph, { requiredSubflowOutputIds: [] })).toEqual({ ok: true, issues: [] });
  });

  it("preserves duplicate and missing-node issue order and multiplicity", () => {
    const graph: ExecutableGraph = {
      flowId: "isolated.invalid",
      nodes: [{ id: "same", definitionId: "example.read" }, { id: "same", definitionId: "example.read" }],
      edges: [{ id: "one", sourceNodeId: "absent", targetNodeId: "gone" }, { id: "one", sourceNodeId: "absent", targetNodeId: "gone" }]
    };
    expect(validateExecutableGraph(graph, { requiredSubflowOutputIds: [] }).issues.map(issue => issue.code)).toEqual([
      "flow.duplicate_node_id", "flow.edge_missing_source_node", "flow.edge_missing_target_node",
      "flow.duplicate_edge_id", "flow.edge_missing_source_node", "flow.edge_missing_target_node"
    ]);
  });
});
