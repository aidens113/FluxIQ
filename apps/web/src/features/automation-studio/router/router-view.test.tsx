import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams()
}));
import { RouterView, RouterViewContent, buildFlowMapRouteTestPayload, flowMapConditionDraft, flowMapConditionExpected, flowMapConditionSummary, flowMapRoutes } from "./index";
import { RouterContentView } from "./RouterContentView";
import { AdaptationsView } from "../adaptations";
import { InstructionsView } from "../instructions";
import { SettingsView } from "../settings";

describe("Automation Router workspace", () => {
  it("shows the Router Flow dependency before route controls", () => {
    const html = renderToStaticMarkup(createElement(RouterView, { projectId: null, flow: null }));
    expect(html).toContain("Select a Flow to edit its Router");
    expect(html).toContain("Router rules belong to one top-level Flow");
    expect(html).not.toContain("New Route");
  });
  it("orders Router rows by priority and then stable route name", () => {
    const routes = flowMapRoutes({ rules: [
      { ruleId: "b", name: "Beta", order: 20 },
      { ruleId: "c", name: "Checkout", order: 10 },
      { ruleId: "a", name: "Account", order: 10 }
    ] });
    expect(routes.map((route) => route.ruleId)).toEqual(["a", "c", "b"]);
  });
  it("renders populated Router routes as one ordered workspace", () => {
    const html = renderToStaticMarkup(createElement(RouterView, {
      projectId: null,
      flow: { flowId: "flow.checkout", name: "Checkout" },
      initialSubflows: [
        { subflowId: "subflow.refund", name: "Refund request", status: "active" },
        { subflowId: "subflow.checkout", name: "Checkout", status: "active" }
      ],
      initialRouter: {
        name: "Checkout Router",
        metadata: { routeGroups: [{ groupId: "billing", name: "Billing", order: 10 }] },
        rules: [{
          ruleId: "route.refund",
          name: "Handle refund",
          order: 10,
          status: "active",
          metadata: { groupId: "billing", conditionSummary: "Customer asks for a refund" },
          target: { kind: "subflow", subflowId: "subflow.refund" }
        }],
        fallback: { kind: "subflow", subflowId: "subflow.checkout" }
      }
    }));

    expect(html).toContain("automation-router-workbench");
    expect(html).toContain("automation-router-route-status");
    expect(html).toContain("Priority 10: Handle refund to Refund request");
    expect(html).toContain("Route and condition");
    expect(html).toContain("Handle refund");
    expect(html).toContain("Customer asks for a refund");
    expect(html).toContain("Refund request");
    expect(html).toContain("Billing");
    expect(html).toContain("Fallback");
    expect(html).toContain("Checkout");
    expect(html).not.toContain("Decision Map");
    expect(html).not.toContain("Route List");
    expect(html).not.toContain("Route Inspector");
    expect(html).not.toContain("Advanced Flow Map Details");
  });
  it("bounds large Router collections to 100 mounted route rows", () => {
    const html = renderToStaticMarkup(createElement(RouterView, {
      projectId: null,
      flow: { flowId: "flow.large", name: "Large" },
      initialSubflows: [{ subflowId: "subflow.target", name: "Target", status: "active" }],
      initialRouter: {
        rules: Array.from({ length: 101 }, (_, index) => ({
          ruleId: "route." + index,
          name: "Route " + index,
          order: index,
          status: "active",
          target: { kind: "subflow", subflowId: "subflow.target" }
        }))
      }
    }));

    expect((html.match(/automation-router-route-row"/g) ?? []).length).toBe(100);
    expect(html).toContain("1-100 of 101 routes");
    expect(html).toContain("Next");
  });
  it("renders Router, instructions, adaptations, and settings as first-class Flow views", () => {
    const flow = { flowId: "flow.checkout", metadata: { trainingMode: "normal", proposalMode: "auto" } };
    const views = [
      renderToStaticMarkup(createElement(RouterView, { projectId: null, flow })),
      renderToStaticMarkup(createElement(InstructionsView, { projectId: null, flow })),
      renderToStaticMarkup(createElement(AdaptationsView, { projectId: null, flow })),
      renderToStaticMarkup(createElement(SettingsView, { projectId: null, flow }))
    ].join("\n");

    expect(views).toContain("Router");
    expect(views).toContain("This Flow needs a subflow");
    expect(views).toContain("Router rules send each run to a subflow target.");
    expect(views).toContain("Create Subflow");
    expect(views).toContain("automation-router-empty-state");
    expect(views).not.toContain("automation-router-first-use-visual");
    expect(views).toContain("Instructions");
    expect(views).toContain("Adaptations");
    expect(views).toContain("Settings");
    expect(views).toContain("Effective Values");
    expect(views).toContain("New");
    expect(views).toContain("Instruction Editor");
    expect(views).toContain("automation-instructions-workspace");
    expect(views).toContain("automation-instruction-editor-sections");
    expect(views).toContain("Save");
  });

  it("keeps Router fallback and route-group lifecycle editing explicit", () => {
    const source = RouterViewContent.toString() + RouterContentView.toString();
    expect(source).toContain("Fallback Behavior");
    expect(source).toContain("Save Fallback");
    expect(source).toContain("commands.saveFallback");
    expect(source).toContain("groupDraft.status");
    expect(source).toContain("Stop the run");
  });
  it("builds friendly typed Router conditions without raw JSON", () => {
    expect(flowMapConditionDraft({ signalPath: "state.cart.total", operator: "greater_than", expected: 25 })).toMatchObject({
      conditionMode: "when",
      conditionSource: "state",
      conditionField: "cart.total",
      conditionValueType: "number",
      conditionExpected: "25"
    });
    const draft = {
      ruleId: "", name: "", description: "", targetSubflowId: "", order: 0, status: "active", groupId: "", confidence: 1,
      conditionMode: "when", conditionSource: "inputs", conditionField: "approved", conditionOperator: "equals", conditionValueType: "boolean", conditionExpected: "true", setAsFallback: false
    };
    expect(flowMapConditionExpected(draft)).toBe(true);
    expect(flowMapConditionSummary(draft)).toBe("Run input approved equals true");
    const source = RouterViewContent.toString() + RouterContentView.toString();
    expect(source).toContain("Match behavior");
    expect(source).toContain("Run input");
    expect(source).toContain("Current state");
    expect(source).not.toContain("Advanced matching");
  });
  it("uses the shared searchable subflow picker for route and fallback targets", () => {
    const source = RouterViewContent.toString() + RouterContentView.toString();
    expect(source).toContain("Search subflows");
    expect(source).toContain("subflowOptions");
    expect(source).toContain("Choose a target subflow");
    expect(source).toContain("Choose a fallback subflow");
    expect(source).not.toContain("<option value=\"\">Select target</option>");
  });
  it("exposes compact authorized actions for every Router row", () => {
    const source = RouterViewContent.toString() + RouterContentView.toString();
    expect(source).toContain("Actions for ");
    expect(source).toContain("Move up");
    expect(source).toContain("Move down");
    expect(source).toContain("Duplicate route");
    expect(source).toContain("Disable route");
    expect(source).toContain("Enable route");
    expect(source).toContain("Delete route");
    expect(source).toContain("commands.mutateRoute");
  });
  it("tests a route with the canonical evaluator and explains the result", () => {
    const draft = {
      ruleId: "", name: "High value", description: "", targetSubflowId: "subflow.review", order: 0, status: "active", groupId: "", confidence: 1,
      conditionMode: "when", conditionSource: "state", conditionField: "cart.total", conditionOperator: "greater_than", conditionValueType: "number", conditionExpected: "25", setAsFallback: false
    };
    expect(buildFlowMapRouteTestPayload(draft, "30")).toEqual({
      condition: { signalPath: "state.cart.total", operator: "greater_than", expected: 25 },
      currentStateSummary: { cart: { total: 30 } }
    });
    expect(buildFlowMapRouteTestPayload({ ...draft, conditionMode: "always" }, "")).toEqual({});
    const source = RouterViewContent.toString() + RouterContentView.toString();
    expect(source).toContain("Test this route");
    expect(source).toContain("Test condition");
    expect(source).toContain("Route does not match");
    expect(source).toContain("commands.testCondition");
  });
  it("keeps Router loading, failures, saves, and authorization explicit", () => {
    const source = RouterViewContent.toString() + RouterContentView.toString();
    expect(source).toContain("Loading Router routes");
    expect(source).toContain("Retry");
    expect(source).toContain("Saving changes");
    expect(source).toContain("Authorize Router Change");
    expect(source).toContain("scopeRef.current");
  });
});
