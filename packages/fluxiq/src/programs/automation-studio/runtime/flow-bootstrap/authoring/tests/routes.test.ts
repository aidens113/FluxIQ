import { describe, expect, it } from "vitest";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import { runAutomationStudioRouter } from "../../../router-runtime.ts";
import { normalizeAutomationStudioFlowBuildPlan } from "../../adaptation.ts";
import { validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBootstrapPlan } from "../../plan/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../plan/tests/index.ts";
import { acceptAutomationStudioFlowBootstrapResult } from "../index.ts";
import { createBlankAutomationStudioFlowArtifact } from "../../../../model/index.ts";

// Routes a model writes, and what the Router then does with them. A route is a
// block with a `when:` line; the steps outside every block run when no route
// holds. What must never come back is the collapse every live-built Flow had:
// a rule with no condition, which always holds, so nothing after it could run.

const registry = new AutomationStudioNodeRegistry(webDomainNodeDefinitionsFixture());
const resolution = {
  scope: { kind: "domain" as const, domainId: "web-automation" },
  runtimeCapabilities: ["web.actions"],
  permissions: ["web-automation.action"]
};

function build(lines: string[]) {
  const accepted = acceptAutomationStudioFlowBootstrapResult({ result: { flow: lines.join("\n") }, registry, resolution });
  const validated = accepted.ok ? validateAutomationStudioFlowBootstrapPlan({ plan: accepted.plan, registry, resolution }) : undefined;
  return { accepted, validated };
}

const TWO_SITUATIONS = [
  "flow: Export the week",
  "subflow notice: an announcement stands in front of the queue",
  "  when: state.page.dialog exists",
  "  step: close the announcement",
  "    node: web.dom.click",
  "    selector: [data-action=dismiss]",
  "  step: read the queue",
  "    node: web.dom.extract_list",
  "    extractList.item: tr.row",
  "    extractList.fields.post: .post",
  "end",
  "step: read the queue",
  "  node: web.dom.extract_list",
  "  extractList.item: tr.row",
  "  extractList.fields.post: .post"
];

describe("Flow script routes", () => {
  it("turns a block's when line into a rule with a real condition and makes the steps outside every block the fallback", () => {
    const { accepted, validated } = build(TWO_SITUATIONS);
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(validated?.ok).toBe(true);
    expect(accepted.plan.router.rules).toEqual([{
      key: "r1",
      name: "an announcement stands in front of the queue",
      targetSubflowKey: "notice",
      routeTags: ["notice"],
      condition: { signalPath: "state.page.dialog", operator: "exists" }
    }]);
    expect(accepted.plan.router.fallback).toEqual({ kind: "subflow", targetSubflowKey: "main" });
    expect(accepted.plan.subflows.map((subflow) => [subflow.key, subflow.role, subflow.nodes.length])).toEqual([
      ["main", "primary", 1],
      ["notice", "utility", 2]
    ]);
  });

  it("builds a Router that takes each route on the state it was written for, with no model", () => {
    const { validated } = build(TWO_SITUATIONS);
    expect(validated?.validated).toBeDefined();
    const parent = createBlankAutomationStudioFlowArtifact({ flowId: "flow.routes", projectId: "project.routes", name: "Routes", now: 1 });
    const topology = normalizeAutomationStudioFlowBuildPlan({ adaptationId: "adaptation.bootstrap.routes", parentFlow: parent, buildPlan: validated!.validated!, sourceInstructionIds: [], now: 1 });
    expect(topology.router.rules[0]?.condition).toEqual({ signalPath: "state.page.dialog", operator: "exists" });
    const subflows = topology.subflows.map((entry) => entry.subflow);
    const route = (state: Record<string, unknown>) => runAutomationStudioRouter({ projectId: "project.routes", flowId: "flow.routes", router: topology.router, subflows, currentStateSummary: state as never, now: () => 1 });
    const announced = route({ page: { dialog: "What's new in Cadence" } });
    const quiet = route({ page: { path: "/queue" } });
    expect(announced.selectedSubflow?.metadata?.bootstrapSymbolicKey).toBe("notice");
    expect(announced.decision.fallbackUsed).toBeUndefined();
    expect(quiet.selectedSubflow?.metadata?.bootstrapSymbolicKey).toBe("main");
    expect(quiet.decision.fallbackUsed).toBe(true);
    expect(quiet.decision.metadata?.evaluations).toEqual([expect.objectContaining({ matched: false, reason: "state.page.dialog does not exist." })]);
  });

  it("refuses a block the router could never run, and a step that runs a block saying nothing about when", () => {
    const unreachable = build(["subflow extra: an extra read", "  step: read", "    node: web.dom.extract_list", "    extractList.item: li", "end", ...TWO_SITUATIONS.slice(11)]);
    expect(unreachable.accepted.ok).toBe(false);
    if (!unreachable.accepted.ok) expect(unreachable.accepted.issues.map((issue) => issue.code)).toContain("flow_script.subflow_unreachable");
    const called = build(["step: run subflow extra", "subflow extra: an extra read", "  step: read", "    node: web.dom.extract_list", "    extractList.item: li", "end"]);
    expect(called.accepted.ok).toBe(false);
    if (!called.accepted.ok) expect(called.accepted.issues.map((issue) => issue.code)).toContain("flow_script.route_condition_missing");
  });

  it("refuses a condition it cannot read, and a branch to the step written next", () => {
    const unreadable = build(["subflow notice: a notice", "  when: the dialog is showing", ...TWO_SITUATIONS.slice(3)]);
    expect(unreadable.accepted.ok).toBe(false);
    if (!unreadable.accepted.ok) expect(unreadable.accepted.issues.map((issue) => issue.code)).toContain("flow_script.invalid_condition");
    const next = build([
      "step: close the announcement",
      "  node: web.dom.click",
      "  selector: [data-action=dismiss]",
      "  on failed: go to read",
      "step read: read the queue",
      "  node: web.dom.extract_list",
      "  extractList.item: tr.row"
    ]);
    expect(next.accepted.ok).toBe(false);
    if (!next.accepted.ok) expect(next.accepted.issues.map((issue) => issue.code)).toContain("flow_script.branch_to_next_step");
  });

  it("refuses a router whose rules carry no condition, however many there are", () => {
    const { accepted } = build(TWO_SITUATIONS);
    if (!accepted.ok) throw new Error("the two-situation script must build");
    const unconditioned: AutomationStudioFlowBootstrapPlan = structuredClone(accepted.plan);
    unconditioned.router.rules = [
      { key: "r1", name: "first", targetSubflowKey: "notice", routeTags: [] },
      { key: "r2", name: "second", targetSubflowKey: "main", routeTags: [] }
    ];
    const validation = validateAutomationStudioFlowBootstrapPlan({ plan: unconditioned, registry, resolution });
    expect(validation.ok).toBe(false);
    expect(validation.issues.filter((issue) => issue.code === "bootstrap.route_condition_missing").map((issue) => issue.path)).toEqual([
      "plan.router.rules.0.condition",
      "plan.router.rules.1.condition"
    ]);
    const shadowed: AutomationStudioFlowBootstrapPlan = structuredClone(accepted.plan);
    shadowed.router.rules.push({ ...structuredClone(shadowed.router.rules[0]!), key: "r2" });
    expect(validateAutomationStudioFlowBootstrapPlan({ plan: shadowed, registry, resolution }).issues.map((issue) => issue.code)).toContain("bootstrap.route_shadowed");
  });
});
