import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../../model/index.ts";
import { automationStudioContinuationAfterFailure, type AutomationStudioFaultAssessment } from "../index.ts";

const ACTION_FAILED: AutomationStudioFaultAssessment = {
  disposition: "refuse",
  category: "action_failed",
  code: "web.action.failed",
  source: "failure_record",
  effect: "ambiguous",
  reason: "The action failed."
};

function actionNode(id: string, parameterValues: AutomationStudioFlowNode["parameterValues"] = {}, metadata?: AutomationStudioFlowNode["metadata"]): AutomationStudioFlowNode {
  return { id, definitionId: "builtin.policy.action", parameterValues: { outputId: `output.${id}`, ...parameterValues }, ...(metadata ? { metadata } : {}) };
}

function flowOf(nodes: AutomationStudioFlowNode[], edges: AutomationStudioFlowDocument["edges"] = [], metadata?: AutomationStudioFlowDocument["metadata"]): AutomationStudioFlowDocument {
  return { schemaVersion: "0.1", flowId: "flow.continuation", ownerKind: "routine", ownerId: "routine.test", name: "Continuation", createdAt: 1, updatedAt: 1, nodes, edges, ...(metadata ? { metadata } : {}) };
}

/** The shape the rule is most often asked about: a step with something after it that reads nothing from it. */
function onwardFlow(node: AutomationStudioFlowNode, after: AutomationStudioFlowNode = actionNode("after")): AutomationStudioFlowDocument {
  return flowOf([node, after], [{ id: "edge.onward", sourceNodeId: node.id, targetNodeId: after.id, sourcePortId: "success" }]);
}

describe("a Flow carries on past a step that failed and nothing needed", () => {
  it("carries on, and says why in words a person can read", () => {
    const flow = onwardFlow(actionNode("banner"));
    const continuation = automationStudioContinuationAfterFailure(flow, flow.nodes[0]!, ACTION_FAILED);

    expect(continuation.continues).toBe(true);
    expect(continuation.reason).toContain("its failure is reported and the Flow carries on");
  });

  it("carries on past a timeout and past a target it could not find", () => {
    const flow = onwardFlow(actionNode("banner"));

    for (const category of ["timeout", "target_not_found", "target_ambiguous"] as const) {
      expect(automationStudioContinuationAfterFailure(flow, flow.nodes[0]!, { ...ACTION_FAILED, category }).continues).toBe(true);
    }
  });
});

describe("a Flow stops where carrying on would report a confident wrong answer", () => {
  it("stops when the failure says the Flow is no longer standing where it assumed", () => {
    const flow = onwardFlow(actionNode("gate"));

    for (const category of ["auth_required", "user_intervention_required", "blocked_by_capability_or_policy", "expected_state_missing", "unexpected_state", "page_changed", "navigation_unexpected", "output_not_observed", "external_side_effect_denied", "ambiguous_or_unknown", "graph_validation_or_unknown_node", "missing_router_or_subflow_target"] as const) {
      const continuation = automationStudioContinuationAfterFailure(flow, flow.nodes[0]!, { ...ACTION_FAILED, category });

      expect(continuation.continues).toBe(false);
      expect(continuation.reason).toContain(category);
    }
  });

  it("stops when the node ran and its result was never confirmed", () => {
    const flow = onwardFlow(actionNode("submit"));

    for (const stage of ["confirmation", "verification"] as const) {
      expect(automationStudioContinuationAfterFailure(flow, flow.nodes[0]!, { ...ACTION_FAILED, stage }).continues).toBe(false);
    }
  });

  it("stops when nothing could classify the failure at all", () => {
    const flow = onwardFlow(actionNode("banner"));
    const continuation = automationStudioContinuationAfterFailure(flow, flow.nodes[0]!, undefined);

    expect(continuation.continues).toBe(false);
    expect(continuation.reason).toContain("nothing could classify");
  });

  it("stops at a node that acted on the world", () => {
    const flow = onwardFlow(actionNode("pay", {}, { destructive: true }));

    expect(automationStudioContinuationAfterFailure(flow, flow.nodes[0]!, ACTION_FAILED).continues).toBe(false);
  });

  it("stops at the node that was capturing the answer", () => {
    const flow = onwardFlow(actionNode("extract", { recordOutput: { datasetId: "rows", schema: { fields: [] } } }));
    const continuation = automationStudioContinuationAfterFailure(flow, flow.nodes[0]!, ACTION_FAILED);

    expect(continuation.continues).toBe(false);
    expect(continuation.reason).toContain("answered nothing");
  });

  it("stops when a later step is bound to what this one produces", () => {
    const reader = actionNode("after", { parameters: { text: { $state: { path: "banner.success" } } } });
    const flow = onwardFlow(actionNode("banner"), reader);
    const continuation = automationStudioContinuationAfterFailure(flow, flow.nodes[0]!, ACTION_FAILED);

    expect(continuation.continues).toBe(false);
    expect(continuation.reason).toContain("reads what banner produces");
  });

  it("stops when a later step takes this one's output through a data edge", () => {
    const flow = flowOf(
      [actionNode("banner"), actionNode("after")],
      [
        { id: "edge.onward", sourceNodeId: "banner", targetNodeId: "after", sourcePortId: "success" },
        { id: "edge.data", sourceNodeId: "banner", sourcePortId: "records", targetNodeId: "after", targetPortId: "rows" }
      ]
    );

    expect(automationStudioContinuationAfterFailure(flow, flow.nodes[0]!, ACTION_FAILED).continues).toBe(false);
  });

  it("stops at a node with nowhere to carry on to", () => {
    const flow = flowOf([actionNode("last")]);
    const continuation = automationStudioContinuationAfterFailure(flow, flow.nodes[0]!, ACTION_FAILED);

    expect(continuation.continues).toBe(false);
    expect(continuation.reason).toContain("no onward route");
  });

  it("stops at a node whose outputs Core cannot even enumerate", () => {
    const flow = onwardFlow({ id: "host", definitionId: "importer.host.step", parameterValues: {} });
    const continuation = automationStudioContinuationAfterFailure(flow, flow.nodes[0]!, ACTION_FAILED);

    expect(continuation.continues).toBe(false);
    expect(continuation.reason).toContain("no registered definition");
  });
});

describe("stopping is sometimes the instruction, and an author who wrote it is obeyed", () => {
  it("stops a step whose own parameters say to, even though nothing needed it", () => {
    const flow = onwardFlow(actionNode("banner", { onFailure: "stop" }));

    expect(automationStudioContinuationAfterFailure(flow, flow.nodes[0]!, ACTION_FAILED).continues).toBe(false);
  });

  it("carries on past a step the author marked optional, or told the Flow to continue past", () => {
    // Both outrank every rule below them: the node acts on the world, holds the
    // answer and has a later step bound to it, and is still walked past.
    const declared = actionNode("pay", { onFailure: "continue", recordOutput: { datasetId: "rows" } }, { destructive: true });
    const optional = actionNode("pay", { recordOutput: { datasetId: "rows" } }, { destructive: true, optional: true });

    expect(automationStudioContinuationAfterFailure(onwardFlow(declared), declared, ACTION_FAILED).continues).toBe(true);
    expect(automationStudioContinuationAfterFailure(onwardFlow(optional), optional, ACTION_FAILED).continues).toBe(true);
  });

  it("reads the Flow's own default when the node states nothing", () => {
    const flow = flowOf(
      [actionNode("gate"), actionNode("after")],
      [{ id: "edge.onward", sourceNodeId: "gate", targetNodeId: "after", sourcePortId: "success" }],
      { onNodeFailure: "continue" }
    );

    expect(automationStudioContinuationAfterFailure(flow, flow.nodes[0]!, { ...ACTION_FAILED, category: "auth_required" }).continues).toBe(true);
  });
});
