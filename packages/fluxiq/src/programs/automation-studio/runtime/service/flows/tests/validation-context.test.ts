// The Subflow role a graph is validated with when it is saved (t398): a
// whole-automation handler is valid only in the recovery Subflow's graph, and
// the graph does not say whose it is, so the save reads it.
import { describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact, validateAutomationStudioFlow, type AutomationStudioFlowArtifact, type AutomationStudioFlowSubflow } from "../../../../model/index.ts";
import { automationStudioFlowValidationContext } from "../validation-context.ts";

function recoveryGraph(withHandler = true): AutomationStudioFlowArtifact {
  const blank = createBlankAutomationStudioFlowArtifact({
    flowId: "flow.parent.recovery.graph",
    projectId: "project.t398",
    name: "Recovery Graph",
    now: 1,
    metadata: { parentFlowId: "flow.parent", parentSubflowId: "subflow.recovery", subflowGraph: true }
  });
  if (!withHandler) return blank;
  return {
    ...blank,
    nodes: [
      { id: "handler", definitionId: "builtin.control.handler", definitionVersion: "1.0.0", parameterValues: { event: "start", scope: { kind: "automation" }, when: [], order: 1 }, position: { x: 0, y: 0 } },
      { id: "end", definitionId: "builtin.control.handler-end", definitionVersion: "1.0.0", parameterValues: { disposition: "resume" }, position: { x: 200, y: 0 } }
    ],
    edges: [{ id: "edge", sourceNodeId: "handler", targetNodeId: "end", sourcePortId: "body", targetPortId: "in" }]
  };
}

function subflow(role: AutomationStudioFlowSubflow["role"], graphFlowId = "flow.parent.recovery.graph"): AutomationStudioFlowSubflow {
  return { schemaVersion: "0.1", subflowId: "subflow.recovery", flowId: "flow.parent", projectId: "project.t398", name: "Recovery", role, status: "active", graphFlowId, createdAt: 1, updatedAt: 1 } as AutomationStudioFlowSubflow;
}

const codes = (flow: AutomationStudioFlowArtifact, context: Parameters<typeof validateAutomationStudioFlow>[1]) => validateAutomationStudioFlow(flow, context).issues.map((issue) => issue.code);

describe("the validation context a saved graph gets", () => {
  it("reads the role of the Subflow the graph names, so its whole-automation handler is valid", async () => {
    const asked: string[] = [];
    const context = await automationStudioFlowValidationContext(recoveryGraph(), async (parentFlowId, subflowId) => {
      asked.push(`${parentFlowId}/${subflowId}`);
      return subflow("recovery");
    });
    expect(asked).toEqual(["flow.parent/subflow.recovery"]);
    expect(context).toEqual({ subflowRole: "recovery" });
    expect(codes(recoveryGraph(), context)).not.toContain("flow.handler_automation_scope_outside_recovery");
    expect(codes(recoveryGraph(), {})).toContain("flow.handler_automation_scope_outside_recovery");
  });

  it("still refuses the handler in a Subflow that is not the recovery one", async () => {
    const context = await automationStudioFlowValidationContext(recoveryGraph(), async () => subflow("utility"));
    expect(codes(recoveryGraph(), context)).toContain("flow.handler_automation_scope_outside_recovery");
  });

  it("keeps a role the caller gave, and reads nothing for a graph with no handler or a Subflow that owns another graph", async () => {
    const never = async () => {
      throw new Error("not read");
    };
    expect(await automationStudioFlowValidationContext(recoveryGraph(), never, { subflowRole: "recovery" })).toEqual({ subflowRole: "recovery" });
    expect(await automationStudioFlowValidationContext(recoveryGraph(false), never)).toEqual({});
    expect(await automationStudioFlowValidationContext(recoveryGraph(), async () => subflow("recovery", "flow.other.graph"))).toEqual({});
    expect(await automationStudioFlowValidationContext(recoveryGraph(), async () => null)).toEqual({});
    // A Subflow that could not be read is no answer: the save fails rather than guessing a role.
    await expect(automationStudioFlowValidationContext(recoveryGraph(), never)).rejects.toThrow("not read");
  });
});
