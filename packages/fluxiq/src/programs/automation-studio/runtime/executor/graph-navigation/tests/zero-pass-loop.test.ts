// t466, lane D round 8 (`run-mv5jnc5m-a47c3e59`, revs 3 and 5): a listing whose two required conditions kept
// 0 of 8 rows fed a For Each that ran no passes. The run reached its final read with the loop's body unvisited and
// was failed `executor.graph.unvisited_nodes`, which the model was told was a wiring fault. A loop that ran no passes
// is a valid ending; a node the run still owed is not excused by it.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../contracts.ts";
import { hasUnvisitedAutomationStudioNodes } from "../../graph-navigation.ts";
import { runAutomationStudioGraph } from "../../index.ts";
import { automationStudioZeroPassLoopBodies } from "../index.ts";

const edge = (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId = "in") => ({ id: `${sourceNodeId}.${sourcePortId}.${targetNodeId}`, sourceNodeId, sourcePortId, targetNodeId, targetPortId });
const constant = (id: string, value: unknown = id): AutomationStudioFlowNode => ({ id, definitionId: "builtin.data.constant", parameterValues: { value } } as AutomationStudioFlowNode);

/** list -> head -> each; body: confirm -> wait -> head; done -> merge -> final read, with no End node (the round-8 shape). */
function confirmLoop(rows: number, extra: { nodes?: AutomationStudioFlowNode[]; edges?: ReturnType<typeof edge>[] } = {}): AutomationStudioFlowDocument {
  return {
    schemaVersion: "0.1", flowId: "flow.zero-pass", ownerKind: "routine", ownerId: "routine.test", name: "Zero pass", createdAt: 1, updatedAt: 1,
    nodes: [
      constant("list", Array.from({ length: rows }, (_, index) => index + 1)),
      { id: "head", definitionId: "builtin.control.merge", parameterValues: { mergeMode: "first" } },
      { id: "each", definitionId: "builtin.control.for-each" },
      constant("confirm"),
      constant("wait"),
      { id: "after", definitionId: "builtin.control.merge", parameterValues: { mergeMode: "first" } },
      constant("final"),
      ...(extra.nodes ?? [])
    ],
    edges: [
      edge("list", "success", "head"), edge("list", "value", "each", "items"), edge("head", "success", "each"),
      edge("each", "body", "confirm"), edge("confirm", "success", "wait"), edge("wait", "success", "head", "branches"),
      edge("each", "done", "after"), edge("after", "success", "final"),
      ...(extra.edges ?? [])
    ]
  };
}

function attempt(nodeId: string, definitionId: string, route?: string): AutomationStudioNodeAttemptTrace {
  return { attemptId: `attempt.${nodeId}.${route ?? "success"}`, nodeId, definitionId, startedAt: 1, status: "succeeded", ...(route ? { route } : {}), inputs: {}, outputs: {}, effects: [] };
}

describe("a loop that ran no passes", () => {
  it("names the nodes only its body reaches, and none its way on reaches", () => {
    const attempts = [attempt("list", "builtin.data.constant"), attempt("head", "builtin.control.merge"), attempt("each", "builtin.control.for-each", "done")];
    expect(automationStudioZeroPassLoopBodies(confirmLoop(0), attempts).sort()).toEqual(["confirm", "head", "wait"]);
  });

  it("names nothing for a loop that took its body at least once, or was never reached", () => {
    const ran = [attempt("each", "builtin.control.for-each", "body"), attempt("confirm", "builtin.data.constant"), attempt("each", "builtin.control.for-each", "done")];
    expect(automationStudioZeroPassLoopBodies(confirmLoop(1), ran)).toEqual([]);
    expect(automationStudioZeroPassLoopBodies(confirmLoop(0), [attempt("list", "builtin.data.constant")])).toEqual([]);
  });

  it("keeps a step the loop's way on also reaches owed", () => {
    const flow = confirmLoop(0, { edges: [edge("each", "failed", "wait")] });
    const attempts = [attempt("each", "builtin.control.for-each", "done")];
    expect(automationStudioZeroPassLoopBodies(flow, attempts)).toEqual(["confirm"]);
  });

  it("ends a run over a list with no rows succeeded at its final read, with the body never run", async () => {
    const trace = await runAutomationStudioGraph(confirmLoop(0), { startNodeId: "list" });
    expect(trace.status).toBe("succeeded");
    expect(trace.failure).toBeUndefined();
    expect(trace.attempts.map((step) => step.nodeId)).toEqual(["list", "head", "each", "after", "final"]);
  });

  it("still fails a run that left a disconnected step behind", async () => {
    const trace = await runAutomationStudioGraph(confirmLoop(0, { nodes: [constant("mandatory")] }), { startNodeId: "list" });
    expect(trace.status).toBe("failed");
    expect(trace.failure?.code).toBe("executor.graph.unvisited_nodes");
  });

  it("still counts an untaken branch inside a loop that did run", () => {
    const flow = confirmLoop(1, { nodes: [constant("other")], edges: [edge("confirm", "failed", "other"), edge("other", "success", "wait")] });
    const attempts = [attempt("list", "builtin.data.constant"), attempt("head", "builtin.control.merge"), attempt("each", "builtin.control.for-each", "body"),
      attempt("confirm", "builtin.data.constant"), attempt("wait", "builtin.data.constant"), attempt("head", "builtin.control.merge"),
      attempt("each", "builtin.control.for-each", "done"), attempt("after", "builtin.control.merge"), attempt("final", "builtin.data.constant")];
    expect(hasUnvisitedAutomationStudioNodes(flow, attempts)).toBe(true);
  });
});
