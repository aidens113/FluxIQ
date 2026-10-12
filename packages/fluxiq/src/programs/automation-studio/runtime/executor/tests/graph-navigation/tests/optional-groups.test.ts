import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../../contracts.ts";
import { hasUnvisitedAutomationStudioNodes } from "../../../graph-navigation.ts";

const node = (id: string, definitionId = "builtin.data.constant"): AutomationStudioFlowNode => ({ id, definitionId });
const edge = (sourceNodeId: string, targetNodeId: string, sourcePortId = "success") => ({ id: `${sourceNodeId}.${sourcePortId}.${targetNodeId}`, sourceNodeId, targetNodeId, sourcePortId });
const attempt = (nodeId: string, extra: Partial<AutomationStudioNodeAttemptTrace> = {}): AutomationStudioNodeAttemptTrace => ({ attemptId: nodeId, nodeId, definitionId: "builtin.data.constant", startedAt: 1, status: "succeeded", inputs: {}, outputs: {}, effects: [], ...extra });
const flow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1", flowId: "optional", ownerKind: "routine", ownerId: "routine", name: "Optional group", createdAt: 1, updatedAt: 1,
  nodes: [node("optional"), node("conditional"), node("join", "builtin.control.merge"), node("required")],
  edges: [edge("optional", "conditional"), edge("conditional", "join"), edge("optional", "join", "failed"), edge("join", "required")]
};
const skipped = attempt("optional", { route: "skipped", skipped: { reason: "target_absent", code: "test.absent" } });

describe("terminal coverage after an optional group", () => {
  it("exempts only the conditional chain the run actually bypassed", () => {
    expect(hasUnvisitedAutomationStudioNodes(flow, [skipped, attempt("join"), attempt("required")])).toBe(false);
    expect(hasUnvisitedAutomationStudioNodes(flow, [skipped, attempt("join")])).toBe(true);
  });

  it("does not exempt an unexecuted mandatory action on a general untaken branch", () => {
    const requiredBranch = { ...flow, nodes: flow.nodes.map((entry) => entry.id === "join" ? node("join") : entry) };
    expect(hasUnvisitedAutomationStudioNodes(requiredBranch, [skipped, attempt("join"), attempt("required")])).toBe(true);
  });

  it("does not exempt conditional nodes when the run did not take the optional way on", () => {
    expect(hasUnvisitedAutomationStudioNodes(flow, [attempt("optional"), attempt("join"), attempt("required")])).toBe(true);
    expect(hasUnvisitedAutomationStudioNodes(flow, [skipped, attempt("required")])).toBe(true);
  });

  it("keeps disconnected mandatory nodes and branching success paths unvisited", () => {
    expect(hasUnvisitedAutomationStudioNodes({ ...flow, nodes: [...flow.nodes, node("mandatory")] }, [skipped, attempt("join"), attempt("required")])).toBe(true);
    expect(hasUnvisitedAutomationStudioNodes({ ...flow, nodes: [...flow.nodes, node("other")], edges: [...flow.edges, edge("conditional", "other", "failed")] }, [skipped, attempt("join"), attempt("required")])).toBe(true);
  });
});
