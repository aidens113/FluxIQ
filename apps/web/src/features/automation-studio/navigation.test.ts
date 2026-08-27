import { describe, expect, it } from "vitest";
import { automationStudioDeepLinkParams, automationStudioDefaultViewForLink, automationStudioFlowScope, automationStudioWorkspaceBreadcrumbs, parseAutomationStudioDeepLink } from "./navigation";

describe("Automation Studio deep links", () => {
  it("parses project, Flow, subflow, view, and typed detail", () => {
    expect(parseAutomationStudioDeepLink("project=p1&flow=f1&subflow=s1&view=runtime-debug&detail=run:r1")).toEqual({
      projectId: "p1", flowId: "f1", subflowId: "s1", viewId: "runtime-debug", detail: { kind: "run", id: "r1" }
    });
  });

  it("normalizes compatibility view IDs", () => {
    expect(parseAutomationStudioDeepLink("project=p1&view=runs-history").viewId).toBe("runtime-debug");
    expect(parseAutomationStudioDeepLink("project=p1&view=signals-web").viewId).toBe("state-explorer");
  });

  it("drops descendants when their parent scope is absent", () => {
    expect(parseAutomationStudioDeepLink("flow=f1&subflow=s1&view=runtime-debug&detail=run:r1")).toEqual({
      projectId: null, flowId: null, subflowId: null, viewId: null, detail: null
    });
    expect(automationStudioDeepLinkParams({ projectId: null }, "project=p1&flow=f1&subflow=s1&view=runtime-debug&detail=run:r1&keep=yes").toString()).toBe("keep=yes");
  });

  it("rejects unknown views and malformed details", () => {
    expect(parseAutomationStudioDeepLink("project=p1&view=unknown&detail=thing:x")).toMatchObject({ viewId: null, detail: null });
  });

  it("builds Flow, Subflow, and current-object breadcrumbs", () => {
    expect(automationStudioWorkspaceBreadcrumbs({ flowId: "flow.top", flowName: "Checkout", subflowId: "subflow.pay", subflowName: "Pay", viewId: "policy-primary", viewLabel: "Nodes" })).toEqual([
      { kind: "flow", id: "flow.top", label: "Checkout", current: false },
      { kind: "subflow", id: "subflow.pay", label: "Pay", current: false },
      { kind: "view", id: "policy-primary", label: "Nodes", current: true }
    ]);
  });

  it("resolves top-level and subflow graph scopes and their default views", () => {
    const entries = [
      { flow: { flowId: "flow.top", metadata: {} } },
      { flow: { flowId: "flow.graph", metadata: { subflowGraph: true, parentFlowId: "flow.top", parentSubflowId: "subflow.checkout" } } }
    ];
    expect(automationStudioFlowScope("flow.top", entries)).toEqual({ flowId: "flow.top", subflowId: null });
    expect(automationStudioFlowScope("flow.graph", entries)).toEqual({ flowId: "flow.top", subflowId: "subflow.checkout" });
    expect(automationStudioDefaultViewForLink({ flowId: "flow.top", subflowId: null, viewId: null })).toBe("flow-router");
    expect(automationStudioDefaultViewForLink({ flowId: "flow.top", subflowId: "subflow.checkout", viewId: null })).toBe("policy-primary");
    expect(automationStudioDefaultViewForLink({ flowId: "flow.top", subflowId: null, viewId: "flow-settings" })).toBe("flow-settings");
  });});