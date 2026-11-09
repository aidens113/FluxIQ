// A step's recovery the run did not need is not a node the Flow left behind,
// and nothing else is excused with it (lane C W10/W11). The graph is what a
// build assembles for a draft step that says `on_failed`: the step's success
// goes straight into a Merge, its failure runs the recovery, which rejoins at
// that same Merge, and the line goes on from there.
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowDocument } from "../../fixture-contracts.ts";
import type { AutomationStudioFlowNode } from "../../../../../flows/executable/graph/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../../index.ts";
import { hasUnvisitedAutomationStudioNodes } from "../../../graph-navigation/index.ts";
import { automationStudioStepRecoveryChain } from "../../../step-skip/index.ts";

const node = (id: string, definitionId = "builtin.data.constant"): AutomationStudioFlowNode => ({ id, definitionId });
const edge = (sourceNodeId: string, targetNodeId: string, sourcePortId = "success", targetPortId = "in") => ({ id: `${sourceNodeId}.${sourcePortId}.${targetNodeId}`, sourceNodeId, targetNodeId, sourcePortId, targetPortId });
const attempt = (nodeId: string, extra: Partial<AutomationStudioNodeAttemptTrace> = {}): AutomationStudioNodeAttemptTrace => ({ attemptId: nodeId, nodeId, definitionId: "builtin.data.constant", startedAt: 1, status: "succeeded", route: "success", inputs: {}, outputs: {}, effects: [], ...extra });
const flow: AutomationStudioFlowDocument = {
  schemaVersion: "0.1", flowId: "recovered", ownerKind: "routine", ownerId: "routine", name: "Recovered step", createdAt: 1, updatedAt: 1,
  nodes: [node("step"), node("recovery"), node("join", "builtin.control.merge"), node("next")],
  edges: [edge("step", "recovery", "failed"), edge("step", "join"), edge("recovery", "join", "success", "branches"), edge("join", "next")]
};
const failed = attempt("step", { status: "failed", route: "failed" });

describe("terminal coverage after a recovered step", () => {
  it("does not count the recovery as left behind when the step succeeded and the run went on through the join", () => {
    expect(hasUnvisitedAutomationStudioNodes(flow, [attempt("step"), attempt("join"), attempt("next")])).toBe(false);
  });

  it("excuses a recovery of several steps that do not branch, every one of them", () => {
    const longer: AutomationStudioFlowDocument = {
      ...flow,
      nodes: [...flow.nodes, node("recovery-2")],
      edges: [edge("step", "recovery", "failed"), edge("step", "join"), edge("recovery", "recovery-2"), edge("recovery-2", "join", "success", "branches"), edge("join", "next")]
    };
    expect(automationStudioStepRecoveryChain(longer, node("step"))).toEqual({ join: "join", steps: ["recovery", "recovery-2"] });
    expect(hasUnvisitedAutomationStudioNodes(longer, [attempt("step"), attempt("join"), attempt("next")])).toBe(false);
  });

  it("excuses it when a failed attempt was sent on down the step's success route, as a person's Continue on a check does", () => {
    expect(hasUnvisitedAutomationStudioNodes(flow, [failed, attempt("join"), attempt("next")])).toBe(false);
  });

  it("is complete when the recovery was needed and ran", () => {
    expect(hasUnvisitedAutomationStudioNodes(flow, [failed, attempt("recovery"), attempt("join"), attempt("next")])).toBe(false);
  });

  it("excuses it on every pass of a span that ran the step more than once", () => {
    expect(hasUnvisitedAutomationStudioNodes(flow, [attempt("step", { attemptId: "a1" }), attempt("join", { attemptId: "a2" }), attempt("step", { attemptId: "a3" }), attempt("join", { attemptId: "a4" }), attempt("next")])).toBe(false);
  });

  it("still counts the line after the join when the run stopped at the join, or before it", () => {
    expect(hasUnvisitedAutomationStudioNodes(flow, [attempt("step"), attempt("join")])).toBe(true);
    expect(hasUnvisitedAutomationStudioNodes(flow, [attempt("step")])).toBe(true);
  });

  it("still counts a recovery that does not rejoin the Merge the step's success goes to", () => {
    const astray: AutomationStudioFlowDocument = {
      ...flow,
      nodes: [...flow.nodes, node("elsewhere")],
      edges: [edge("step", "recovery", "failed"), edge("step", "join"), edge("recovery", "elsewhere"), edge("join", "next")]
    };
    expect(automationStudioStepRecoveryChain(astray, node("step"))).toBeUndefined();
    expect(hasUnvisitedAutomationStudioNodes(astray, [attempt("step"), attempt("join"), attempt("next")])).toBe(true);
  });

  it("still counts a failure branch that branches again", () => {
    const branching: AutomationStudioFlowDocument = {
      ...flow,
      nodes: [...flow.nodes, node("other")],
      edges: [...flow.edges, edge("recovery", "other", "failed")]
    };
    expect(automationStudioStepRecoveryChain(branching, node("step"))).toBeUndefined();
    expect(hasUnvisitedAutomationStudioNodes(branching, [attempt("step"), attempt("join"), attempt("next")])).toBe(true);
  });

  it("still counts the failure branch of a step whose success does not go straight into the Merge", () => {
    const detour: AutomationStudioFlowDocument = {
      ...flow,
      nodes: [...flow.nodes, node("between")],
      edges: [edge("step", "recovery", "failed"), edge("step", "between"), edge("between", "join", "success", "branches"), edge("recovery", "join", "success", "branches"), edge("join", "next")]
    };
    expect(automationStudioStepRecoveryChain(detour, node("step"))).toBeUndefined();
    expect(hasUnvisitedAutomationStudioNodes(detour, [attempt("step"), attempt("between"), attempt("join"), attempt("next")])).toBe(true);
  });

  it("still counts a general untaken branch whose two ways meet at a node that is not a Merge", () => {
    const plain: AutomationStudioFlowDocument = { ...flow, nodes: flow.nodes.map((entry) => entry.id === "join" ? node("join") : entry) };
    expect(automationStudioStepRecoveryChain(plain, node("step"))).toBeUndefined();
    expect(hasUnvisitedAutomationStudioNodes(plain, [attempt("step"), attempt("join"), attempt("next")])).toBe(true);
  });

  it("is not the optional shape: a failure straight into the Merge has no recovery to excuse", () => {
    const optional: AutomationStudioFlowDocument = { ...flow, edges: [edge("step", "join", "failed"), edge("step", "join"), edge("join", "next")], nodes: flow.nodes.filter((entry) => entry.id !== "recovery") };
    expect(automationStudioStepRecoveryChain(optional, node("step"))).toBeUndefined();
  });
});
