import { describe, expect, it } from "vitest";
import { automationStudioFlowBootstrapRouteIssues, validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBootstrapSubflow } from "../index.ts";
import { stateNodeRegistryFixture } from "./index.ts";

function part(key: string, called?: string): AutomationStudioFlowBootstrapSubflow {
  return {
    key,
    name: key,
    role: key === "main" ? "primary" : "utility",
    nodes: [{ key: "step", definitionId: called === undefined ? "builtin.control.end" : "builtin.control.call-subflow", definitionVersion: "1.0.0", ...(called === undefined ? {} : { parameters: { subflowId: called, inputs: {} } }) }],
    edges: []
  };
}

function plan(subflows: AutomationStudioFlowBootstrapSubflow[]): AutomationStudioFlowBootstrapPlan {
  return { schemaVersion: "0.1", router: { name: "Entries", rules: [], fallback: { kind: "subflow", targetSubflowKey: "main" } }, subflows };
}

const resolution = { scope: { kind: "domain" as const, domainId: "demo" }, runtimeCapabilities: [], permissions: [] };

describe("candidate calls are rooted in actual entry graphs", () => {
  it("refuses an orphan cycle that mentions every helper without an entry reaching either", () => {
    const orphan = plan([part("main"), part("left", "right"), part("right", "left")]);
    const result = validateAutomationStudioFlowBootstrapPlan({ plan: orphan, registry: stateNodeRegistryFixture([]), resolution });
    expect(result.ok).toBe(false);
    expect(result.issues.filter((issue) => issue.code === "bootstrap.subflow_unreachable").map((issue) => issue.path)).toEqual(["plan.subflows.1", "plan.subflows.2"]);
  });

  it("refuses a candidate-external symbolic call target at the exact call parameter", () => {
    const unknown = plan([part("main", "foreign")]);
    expect(automationStudioFlowBootstrapRouteIssues(unknown)).toEqual([expect.objectContaining({ code: "bootstrap.unknown_call_target", path: "plan.subflows.0.nodes.0.parameters.subflowId" })]);
  });

  it("refuses a dynamic candidate target while leaving runtime input bindings separate", () => {
    const dynamic = plan([part("main", "ignored")]);
    dynamic.subflows[0]!.nodes[0]!.parameters = { subflowId: { $state: { path: "run.target" } }, inputs: { value: { $state: { path: "run.value" } } } };
    const result = validateAutomationStudioFlowBootstrapPlan({ plan: dynamic, registry: stateNodeRegistryFixture([]), resolution });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("bootstrap.unknown_call_target");
  });

  it("allows a nested helper shared by an ordered route and the fallback", () => {
    const shared = plan([part("main", "outer"), part("alternate", "shared"), part("outer", "shared"), part("shared", "leaf"), part("leaf")]);
    shared.router.rules.push({ key: "alternate", name: "Alternate", targetSubflowKey: "alternate", routeTags: [], condition: { signalPath: "inputs.mode", operator: "equals", expected: "alternate" } });
    const result = validateAutomationStudioFlowBootstrapPlan({ plan: shared, registry: stateNodeRegistryFixture([]), resolution });
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("refuses an uncalled helper even if its own graph calls an entry", () => {
    const uncalled = plan([part("main"), part("orphan", "main")]);
    expect(automationStudioFlowBootstrapRouteIssues(uncalled)).toEqual([expect.objectContaining({ code: "bootstrap.subflow_unreachable", path: "plan.subflows.1" })]);
  });

  it("does not create an implicit primary entry when Router and fallback name none", () => {
    const missing = plan([part("main", "helper"), part("helper")]);
    missing.router.fallback = { kind: "fail" };
    expect(automationStudioFlowBootstrapRouteIssues(missing).filter((issue) => issue.code === "bootstrap.subflow_unreachable")).toHaveLength(2);
  });

  it("does not treat an unknown fallback target as a candidate entry", () => {
    const missing = plan([part("main"), part("helper", "main")]);
    missing.router.fallback = { kind: "subflow", targetSubflowKey: "foreign" };
    const result = validateAutomationStudioFlowBootstrapPlan({ plan: missing, registry: stateNodeRegistryFixture([]), resolution });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("bootstrap.unknown_router_fallback");
    expect(result.issues.filter((issue) => issue.code === "bootstrap.subflow_unreachable")).toHaveLength(2);
  });

  it("refuses a disabled-rule field instead of treating it as an enabled candidate entry", () => {
    const disabled = plan([part("main"), part("helper")]);
    const rule = { key: "disabled", name: "Disabled", targetSubflowKey: "helper", routeTags: [], condition: { signalPath: "inputs.mode", operator: "equals" as const, expected: "helper" }, enabled: false };
    disabled.router.rules.push(rule);
    const result = validateAutomationStudioFlowBootstrapPlan({ plan: disabled, registry: stateNodeRegistryFixture([]), resolution });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.path === "plan.router.rules.0.enabled")).toBe(true);
  });

  it("keeps explicit recovery registrations and their nested helper calls reachable", () => {
    const recovery = part("recovery", "helper");
    recovery.role = "recovery";
    recovery.nodes.unshift({ key: "registration", definitionId: "builtin.control.handler", definitionVersion: "1.0.0" });
    expect(automationStudioFlowBootstrapRouteIssues(plan([part("main"), recovery, part("helper")]))).toEqual([]);
    recovery.role = "utility";
    expect(automationStudioFlowBootstrapRouteIssues(plan([part("main"), recovery, part("helper")])).filter((issue) => issue.code === "bootstrap.subflow_unreachable")).toHaveLength(2);
  });

  it("leaves a recovery graph without a registration unreachable", () => {
    const recovery = part("recovery", "helper");
    recovery.role = "recovery";
    expect(automationStudioFlowBootstrapRouteIssues(plan([part("main"), recovery, part("helper")])).filter((issue) => issue.code === "bootstrap.subflow_unreachable")).toHaveLength(2);
  });

  it("terminates traversal for a reached call cycle without replacing runtime recursion policy", () => {
    expect(automationStudioFlowBootstrapRouteIssues(plan([part("main", "helper"), part("helper", "main")]))).toEqual([]);
  });
});

describe("Router ordering remains narrow", () => {
  it("allows distinct overlapping conditions and still refuses exact duplicates", () => {
    const ordered = plan([part("main"), part("alternate")]);
    ordered.router.rules = [
      { key: "positive", name: "Positive", targetSubflowKey: "main", routeTags: [], condition: { signalPath: "inputs.count", operator: "greater_than", expected: 0 } },
      { key: "specific", name: "Specific", targetSubflowKey: "alternate", routeTags: [], condition: { signalPath: "inputs.count", operator: "equals", expected: 2 } }
    ];
    expect(automationStudioFlowBootstrapRouteIssues(ordered)).toEqual([]);
    ordered.router.rules.push({ ...ordered.router.rules[0]!, key: "duplicate" });
    expect(automationStudioFlowBootstrapRouteIssues(ordered).map((issue) => issue.code)).toContain("bootstrap.route_shadowed");
  });
});
