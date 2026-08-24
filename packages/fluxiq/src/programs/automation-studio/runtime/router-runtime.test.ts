import { describe, expect, it } from "vitest";
import { createAutomationStudioFlowExpansionFixture } from "../model/index.ts";
import {
  compileAutomationStudioRouterPlan,
  defaultAutomationStudioSubflowForFlow,
  runAutomationStudioRouter
} from "./router-runtime.ts";

describe("Automation Studio router runtime", () => {
  it("selects the first active matching rule in stable order", () => {
    const fixture = createAutomationStudioFlowExpansionFixture(1_000);
    const [primary, recovery] = fixture.subflows;
    const result = runAutomationStudioRouter({
      projectId: fixture.flow.projectId,
      flowId: fixture.flow.flowId,
      router: {
        ...fixture.router,
        rules: [
          { ...fixture.router.rules[0]!, ruleId: "rule.second", order: 20, target: { kind: "subflow", subflowId: recovery!.subflowId }, condition: { signalPath: "state.dialog.visible", operator: "equals", expected: true } },
          { ...fixture.router.rules[0]!, ruleId: "rule.first", order: 10, target: { kind: "subflow", subflowId: primary!.subflowId }, condition: { signalPath: "inputs.mode", operator: "equals", expected: "primary" } }
        ]
      },
      subflows: fixture.subflows,
      inputs: { mode: "primary" },
      currentStateSummary: { dialog: { visible: true } },
      now: () => 123
    });

    expect(result.status).toBe("running");
    expect(result.selectedSubflow?.subflowId).toBe(primary!.subflowId);
    expect(result.decision).toMatchObject({ selectedRuleId: "rule.first", selectedSubflowId: primary!.subflowId, decidedAt: 123 });
    expect(result.evaluations.map((item) => item.ruleId)).toEqual(["rule.first"]);
  });

  it("skips disabled rules and records rejected rule IDs", () => {
    const fixture = createAutomationStudioFlowExpansionFixture(1_000);
    const [primary, recovery] = fixture.subflows;
    const result = runAutomationStudioRouter({
      projectId: fixture.flow.projectId,
      flowId: fixture.flow.flowId,
      router: {
        ...fixture.router,
        rules: [
          { ...fixture.router.rules[0]!, ruleId: "rule.disabled", order: 1, status: "disabled", target: { kind: "subflow", subflowId: recovery!.subflowId } },
          { ...fixture.router.rules[0]!, ruleId: "rule.active", order: 2, target: { kind: "subflow", subflowId: primary!.subflowId } }
        ]
      },
      subflows: fixture.subflows,
      now: () => 124
    });

    expect(result.selectedSubflow?.subflowId).toBe(primary!.subflowId);
    expect(result.decision.rejectedRuleIds).toEqual(["rule.disabled"]);
  });

  it("fails route plans with missing rule targets", () => {
    const fixture = createAutomationStudioFlowExpansionFixture(1_000);
    const plan = compileAutomationStudioRouterPlan({
      router: {
        ...fixture.router,
        rules: [{ ...fixture.router.rules[0]!, target: { kind: "subflow", subflowId: "subflow.missing" } }]
      },
      subflows: fixture.subflows
    });

    expect(plan.status).toBe("failed");
    expect(plan.diagnostics).toEqual([expect.objectContaining({ code: "router.rule_missing_target", subflowId: "subflow.missing" })]);
  });

  it("uses configured fallback when no rule matches", () => {
    const fixture = createAutomationStudioFlowExpansionFixture(1_000);
    const [primary] = fixture.subflows;
    const result = runAutomationStudioRouter({
      projectId: fixture.flow.projectId,
      flowId: fixture.flow.flowId,
      router: {
        ...fixture.router,
        fallback: { kind: "subflow", subflowId: primary!.subflowId },
        rules: [{ ...fixture.router.rules[0]!, condition: { signalPath: "inputs.mode", operator: "equals", expected: "missing" } }]
      },
      subflows: fixture.subflows,
      inputs: { mode: "other" },
      now: () => 125
    });

    expect(result.status).toBe("running");
    expect(result.decision).toMatchObject({ fallbackUsed: true, selectedSubflowId: primary!.subflowId });
  });

  it("projects a single graph Flow as a generated default subflow", () => {
    const fixture = createAutomationStudioFlowExpansionFixture(1_000);
    const subflow = defaultAutomationStudioSubflowForFlow(fixture.flow);

    expect(subflow).toMatchObject({
      flowId: fixture.flow.flowId,
      projectId: fixture.flow.projectId,
      role: "primary",
      status: "active",
      graphFlowId: fixture.flow.flowId,
      metadata: { generatedDefault: true }
    });
  });

  it("records reroute source metadata in the decision", () => {
    const fixture = createAutomationStudioFlowExpansionFixture(1_000);
    const result = runAutomationStudioRouter({
      projectId: fixture.flow.projectId,
      flowId: fixture.flow.flowId,
      router: fixture.router,
      subflows: fixture.subflows,
      currentStateSummary: { app: { dialog: { visible: true } } },
      rerouteSource: { fromSubflowId: "subflow.previous", reason: "Detected another known screen." },
      now: () => 126
    });

    expect(result.decision.metadata).toMatchObject({
      rerouteSource: { fromSubflowId: "subflow.previous", reason: "Detected another known screen." }
    });
  });
});
