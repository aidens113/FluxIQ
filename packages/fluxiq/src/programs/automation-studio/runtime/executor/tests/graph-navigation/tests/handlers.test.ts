import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../../contracts.ts";
import { automationStudioNodeEndsRun, hasUnvisitedAutomationStudioNodes } from "../../../graph-navigation.ts";
import { runAutomationStudioGraph } from "../../../index.ts";

const HANDLER = "builtin.control.handler";
const HANDLER_END = "builtin.control.handler-end";

function edge(sourceNodeId: string, targetNodeId: string, sourcePortId = "success"): AutomationStudioFlowEdge {
  return { id: `${sourceNodeId}.${sourcePortId}.${targetNodeId}`, sourceNodeId, targetNodeId, sourcePortId };
}

function flowOf(nodes: AutomationStudioFlowNode[], edges: AutomationStudioFlowEdge[]): AutomationStudioFlowDocument {
  return { schemaVersion: "0.1", flowId: "flow.navigation", ownerKind: "routine", ownerId: "routine.navigation", name: "Navigation", createdAt: 1, updatedAt: 1, nodes, edges };
}

function attempt(nodeId: string, definitionId: string): AutomationStudioNodeAttemptTrace {
  return { attemptId: `attempt.${nodeId}`, nodeId, definitionId, startedAt: 1, status: "succeeded", inputs: {}, outputs: {}, effects: [] };
}

const constant = (id: string): AutomationStudioFlowNode => ({ id, definitionId: "builtin.data.constant", parameterValues: { value: id } });

// start -> work, with no End; a Handler whose body is dismiss -> dismiss.end.
const withHandler = flowOf(
  [
    { id: "start", definitionId: "builtin.control.start" },
    constant("work"),
    { id: "handler", definitionId: HANDLER, parameterValues: { event: "fail", scope: { kind: "subflow" } } },
    constant("dismiss"),
    { id: "dismiss.end", definitionId: HANDLER_END, parameterValues: { disposition: "unhandled" } }
  ],
  [edge("start", "work"), edge("handler", "dismiss", "body"), edge("dismiss", "dismiss.end")]
);

describe("graph navigation around handlers", () => {
  it("ends a run at an End node or a Handler End, and nowhere else", () => {
    expect(automationStudioNodeEndsRun("builtin.control.end")).toBe(true);
    expect(automationStudioNodeEndsRun(HANDLER_END)).toBe(true);
    expect(automationStudioNodeEndsRun(HANDLER)).toBe(false);
    expect(automationStudioNodeEndsRun("builtin.data.constant")).toBe(false);
  });

  it("never counts a Handler or the nodes only its body reaches as unvisited", () => {
    expect(hasUnvisitedAutomationStudioNodes(withHandler, [attempt("start", "builtin.control.start"), attempt("work", "builtin.data.constant")])).toBe(false);
    // A main-path node the run did not reach still counts.
    expect(hasUnvisitedAutomationStudioNodes(withHandler, [attempt("start", "builtin.control.start")])).toBe(true);
  });

  it("still counts a node the main path reaches even when a body leads to it too", () => {
    const shared = flowOf(
      [{ id: "start", definitionId: "builtin.control.start" }, constant("work"), { id: "handler", definitionId: HANDLER }, constant("shared")],
      [edge("start", "work"), edge("work", "shared", "failed"), edge("handler", "shared", "body")]
    );
    expect(hasUnvisitedAutomationStudioNodes(shared, [attempt("start", "builtin.control.start"), attempt("work", "builtin.data.constant")])).toBe(true);
  });

  it("treats a body run that reached its Handler End as having left nothing behind", () => {
    expect(hasUnvisitedAutomationStudioNodes(withHandler, [attempt("dismiss", "builtin.data.constant"), attempt("dismiss.end", HANDLER_END)])).toBe(false);
  });

  it("lets graph-run finish a Flow that holds a Handler, and a body run at its Handler End", async () => {
    const main = await runAutomationStudioGraph(withHandler, {});
    expect(main.status).toBe("succeeded");
    expect(main.attempts.map((entry) => entry.nodeId)).toEqual(["start", "work"]);

    const body = await runAutomationStudioGraph(withHandler, { startNodeId: "dismiss" });
    expect(body.status).toBe("succeeded");
    expect(body.attempts.map((entry) => entry.nodeId)).toEqual(["dismiss", "dismiss.end"]);
    expect(body.attempts[1]?.outputs).toMatchObject({ disposition: "unhandled" });
  });
});
