import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../../contracts.ts";
import { hasUnvisitedAutomationStudioNodes } from "../../../graph-navigation.ts";

function edge(sourceNodeId: string, targetNodeId: string): AutomationStudioFlowEdge {
  return { id: `${sourceNodeId}.success.${targetNodeId}`, sourceNodeId, targetNodeId, sourcePortId: "success" };
}

function attempt(nodeId: string, entry?: AutomationStudioNodeAttemptTrace["entry"]): AutomationStudioNodeAttemptTrace {
  return { attemptId: `attempt.${nodeId}`, nodeId, definitionId: "builtin.data.constant", startedAt: 1, status: "succeeded", inputs: {}, outputs: {}, effects: [], ...(entry ? { entry } : {}) };
}

const constant = (id: string): AutomationStudioFlowNode => ({ id, definitionId: "builtin.data.constant", parameterValues: { value: id } });

// start -> choose-store -> search -> add, with no End; `search` is an alternative entry.
const flow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1", flowId: "flow.entered", ownerKind: "routine", ownerId: "routine.entered", name: "Entered later", createdAt: 1, updatedAt: 1,
  nodes: [{ id: "start", definitionId: "builtin.control.start" }, constant("choose-store"), constant("search"), constant("add")],
  edges: [edge("start", "choose-store"), edge("choose-store", "search"), edge("search", "add")]
};

describe("which nodes a frame that began at an alternative entry still owes", () => {
  it("counts only the nodes reachable from the entry it began at", () => {
    const entered = [attempt("search", { kind: "entry", id: "search" } as AutomationStudioNodeAttemptTrace["entry"]), attempt("add")];
    expect(hasUnvisitedAutomationStudioNodes(flow, entered)).toBe(false);
  });

  it("still owes a reachable node the entered run did not visit", () => {
    const entered = [attempt("search", { kind: "entry", id: "search" } as AutomationStudioNodeAttemptTrace["entry"])];
    expect(hasUnvisitedAutomationStudioNodes(flow, entered)).toBe(true);
  });

  it("keeps the whole-graph rule for a frame that began at its default start", () => {
    expect(hasUnvisitedAutomationStudioNodes(flow, [attempt("search"), attempt("add")])).toBe(true);
    expect(hasUnvisitedAutomationStudioNodes(flow, [attempt("search", { kind: "default" } as AutomationStudioNodeAttemptTrace["entry"]), attempt("add")])).toBe(true);
  });
});
