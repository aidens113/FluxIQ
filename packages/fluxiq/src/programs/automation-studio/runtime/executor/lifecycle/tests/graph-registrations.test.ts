import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../../model/index.ts";
import { AUTOMATION_STUDIO_AUTHORED_PATH_ORDER, automationStudioGraphHandlerRegistrations } from "../graph-registrations.ts";

const nodes: AutomationStudioFlowNode[] = [
  { id: "start", definitionId: "builtin.control.start" },
  { id: "press", definitionId: "web.press" },
  { id: "popup", definitionId: "web.press" },
  { id: "join", definitionId: "builtin.control.merge" },
  { id: "fallback", definitionId: "web.press" },
  { id: "dismiss", definitionId: "web.press", metadata: { clearsInterference: true, readyState: { conditions: [{ kind: "visible" }] } } },
  {
    id: "h-1",
    definitionId: "builtin.control.handler",
    parameterValues: { event: "before", scope: { kind: "nodes", nodeIds: ["press"] }, when: [{ fact: "host.dialog", op: "visible" }], order: 3, completionCheck: [{ fact: "host.dialog", op: "absent" }] }
  },
  { id: "h-body", definitionId: "web.press" },
  { id: "h-end", definitionId: "builtin.control.handler-end", parameterValues: { disposition: "resume" } },
  { id: "h-bad", definitionId: "builtin.control.handler", parameterValues: { event: "sometime", scope: { kind: "nodes", nodeIds: [] } } }
];

const edges: AutomationStudioFlowEdge[] = [
  { id: "e1", sourceNodeId: "start", targetNodeId: "press" },
  { id: "e2", sourceNodeId: "press", targetNodeId: "popup", sourcePortId: "success", targetPortId: "in" },
  { id: "e3", sourceNodeId: "press", targetNodeId: "fallback", sourcePortId: "failed", targetPortId: "in" },
  { id: "e4", sourceNodeId: "press", targetNodeId: "fallback", sourcePortId: "error.out_of_stock", targetPortId: "in" },
  { id: "e5", sourceNodeId: "popup", targetNodeId: "join", sourcePortId: "success", targetPortId: "in" },
  { id: "e6", sourceNodeId: "popup", targetNodeId: "join", sourcePortId: "failed", targetPortId: "in" },
  { id: "e7", sourceNodeId: "h-1", targetNodeId: "h-body", sourcePortId: "body", targetPortId: "in" },
  { id: "e8", sourceNodeId: "h-body", targetNodeId: "h-end", sourcePortId: "success", targetPortId: "in" }
];

describe("reading a graph into handler registrations", () => {
  const { registrations, problems } = automationStudioGraphHandlerRegistrations({ graphFlowId: "g", subflowId: "s", nodes, edges });
  const byId = new Map(registrations.map((registration) => [registration.handlerId, registration]));

  it("reads a Handler node from its parameters", () => {
    expect(byId.get("g/h-1")).toMatchObject({
      event: "before",
      scope: { kind: "nodes", nodeIds: ["press"] },
      when: [{ fact: "host.dialog", op: "visible" }],
      order: 3,
      completionCheck: [{ fact: "host.dialog", op: "absent" }],
      maxRuns: 1,
      documentIndex: 6,
      source: { kind: "handler_node", nodeId: "h-1", bodyNodeId: "h-body" },
      budgetFree: false,
      subflowId: "s"
    });
  });

  it("leaves out and names a Handler it cannot read", () => {
    expect(byId.has("g/h-bad")).toBe(false);
    expect(problems.join(" ")).toContain("h-bad");
  });

  it("reads the authored failed edge and error ports as node-scoped On Fail registrations after every handler", () => {
    expect(byId.get("g/e3")).toMatchObject({ event: "fail", scope: { kind: "nodes", nodeIds: ["press"] }, order: AUTOMATION_STUDIO_AUTHORED_PATH_ORDER, source: { kind: "failed_edge", portId: "failed", targetNodeId: "fallback" }, budgetFree: false });
    expect(byId.get("g/e4")).toMatchObject({ event: "fail", source: { kind: "failed_edge", portId: "error.out_of_stock" } });
  });

  it("reads an optional step's way on as a budget-free On Fail registration in place of its failed edge", () => {
    expect(byId.get("g/e6")).toMatchObject({ event: "fail", scope: { kind: "nodes", nodeIds: ["popup"] }, source: { kind: "optional_way_on", nodeId: "popup", targetNodeId: "join" }, budgetFree: true });
    expect(registrations.filter((registration) => registration.scope.kind === "nodes" && registration.scope.nodeIds.includes("popup"))).toHaveLength(1);
  });

  it("reads a clears-interference node as an implicit automation-scope retry registration", () => {
    expect(byId.get("g/dismiss#clears_interference")).toMatchObject({
      event: "retry",
      scope: { kind: "automation" },
      source: { kind: "clears_interference", nodeId: "dismiss", readyState: { conditions: [{ kind: "visible" }] } }
    });
  });
});
