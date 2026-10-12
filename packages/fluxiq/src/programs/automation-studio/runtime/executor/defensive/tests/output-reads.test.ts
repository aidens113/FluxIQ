import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../model/index.ts";
import { automationStudioOutputReads } from "../index.ts";

const node = (id: string, parameterValues: AutomationStudioFlowNode["parameterValues"] = {}): AutomationStudioFlowNode => ({ id, definitionId: "builtin.policy.action", parameterValues });
const bind = (path: string) => ({ $state: { path } });
const flowOf = (nodes: AutomationStudioFlowNode[], edges: AutomationStudioFlowDocument["edges"]): AutomationStudioFlowDocument => ({
  schemaVersion: "0.1", flowId: "flow.reads", ownerKind: "routine", ownerId: "routine.test", name: "Reads", createdAt: 1, updatedAt: 1, nodes, edges
});

describe("the reads of what one node produces", () => {
  it("lists data edges first, then state bindings in node order, with the path each reads", () => {
    const flow = flowOf(
      [node("p"), node("a", { nested: { list: [bind("p.rows.0")] } }), node("b", { value: bind("rows") }), node("c", { other: bind("q.rows") })],
      [
        { id: "control", sourceNodeId: "p", sourcePortId: "success", targetNodeId: "a", targetPortId: "in" },
        { id: "data", sourceNodeId: "p", sourcePortId: "rows", targetNodeId: "c", targetPortId: "items" }
      ]
    );
    expect(automationStudioOutputReads(flow, flow.nodes[0]!, ["rows"], new Set(["a", "b", "c"]))).toEqual([
      { readerNodeId: "c", path: "p.rows" },
      { readerNodeId: "a", path: "p.rows.0" },
      { readerNodeId: "b", path: "rows" }
    ]);
  });

  it("reads only among the readers given, and never the producer's own bindings", () => {
    const flow = flowOf([node("p", { self: bind("p.rows") }), node("a", { value: bind("p.rows") })], [{ id: "data", sourceNodeId: "p", targetNodeId: "a", targetPortId: "items" }]);
    expect(automationStudioOutputReads(flow, flow.nodes[0]!, ["rows"], new Set(["p"]))).toEqual([]);
    expect(automationStudioOutputReads(flow, flow.nodes[0]!, ["rows"], new Set(["p", "a"]))).toEqual([
      { readerNodeId: "a", path: "p" },
      { readerNodeId: "a", path: "p.rows" }
    ]);
  });

  it("counts a binding under the producer's id even when its outputs are not known", () => {
    const flow = flowOf([node("p"), node("a", { value: bind("p.anything") }), node("b", { value: bind("anything") })], []);
    expect(automationStudioOutputReads(flow, flow.nodes[0]!, [], new Set(["a", "b"]))).toEqual([{ readerNodeId: "a", path: "p.anything" }]);
  });
});
