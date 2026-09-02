import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams()
}));
import { SubflowsView, SubflowDirectoryContent, readSubflowDirectoryUrlState, routerReferencesForSubflow, routerReferenceSummaryForSubflow, subflowReadiness } from "./index";

describe("Automation Subflows workspace", () => {
  it("restores Subflow directory filters and pagination from URL state", () => {
    expect(readSubflowDirectoryUrlState({ search: "checkout", status: "active", role: "primary", sort: "name", direction: "asc", limit: 50, offset: 100 })).toEqual({
      search: "checkout",
      status: "active",
      role: "primary",
      sort: "name",
      direction: "asc",
      limit: 50,
      offset: 100
    });
  });
  it("exposes focused Subflow lifecycle actions without embedding an editor", () => {
    const source = SubflowDirectoryContent.toString();
    expect(source).toContain("Rename subflow");
    expect(source).toContain("Duplicate subflow");
    expect(source).toContain("Disable subflow");
    expect(source).toContain("Enable subflow");
    expect(source).toContain("Archive subflow");
    expect(source).toContain("Delete subflow");
    expect(source).toContain("independent Nodes graph");
    expect(source).toContain("Router references must be removed first");
    expect(source).toContain("Security PIN");
  });
  it("renders Subflows as a link directory without an embedded editor", () => {
    const html = renderToStaticMarkup(createElement(SubflowsView, {
      projectId: null,
      flow: { flowId: "flow.checkout", name: "Checkout" }
    }));

    expect(html).toContain("automation-subflow-directory");
    expect(html).toContain("No subflows yet");
    expect(html).toContain("plus button beside the Subflows folder");
    expect(html).not.toContain("Subflow Detail");
    expect(html).not.toContain("Show Subflow JSON");
    expect(html).not.toContain("automation-policy-canvas");
    expect(html).toContain("Search subflows");
    expect(html).toContain("All statuses");
    expect(html).toContain("Subflows per page");
    expect(html).toContain("First page");
    expect(html).toContain("Last page");
    expect(html).toContain('class="automation-subflow-directory-list" role="list"');
    expect(html).toContain('class="automation-subflow-directory-empty" role="listitem"');
  });
  it("caps restored Subflow directory pages at 50 rows", () => {
    expect(readSubflowDirectoryUrlState({ limit: 50, offset: 9950 })).toMatchObject({ limit: 50, offset: 9950 });
    expect(readSubflowDirectoryUrlState({ limit: 100 })).toMatchObject({ limit: 25, offset: 0 });
  });

  it("derives subflow router reverse references without loading run history", () => {
    const references = routerReferencesForSubflow({
      routerId: "router.checkout",
      status: "active",
      rules: [
        { ruleId: "rule.checkout", name: "Checkout", status: "active", order: 1, target: { kind: "subflow", subflowId: "subflow.checkout" }, condition: { signalPath: "inputs.mode", operator: "equals", expected: "checkout" } },
        { ruleId: "rule.other", name: "Other", status: "active", order: 2, target: { kind: "subflow", subflowId: "subflow.other" } }
      ],
      fallback: { kind: "subflow", subflowId: "subflow.checkout" }
    }, "subflow.checkout");

    expect(references).toEqual([
      { id: "rule.checkout", name: "Checkout", status: "active", order: 1, condition: "inputs.mode equals checkout" },
      { id: "router.checkout:fallback", name: "Fallback", status: "active", order: "fallback", condition: "No rule matched" }
    ]);
  });

  it("summarizes Subflow readiness independently from Router usage", () => {
    expect(subflowReadiness({ status: "active", graphFlowId: "flow.checkout.graph" })).toEqual({ label: "Ready", tone: "ready", issues: [] });
    expect(subflowReadiness({ status: "disabled" })).toEqual({ label: "Needs setup", tone: "attention", issues: ["Nodes graph is missing", "Subflow is disabled"] });
  });

  it("uses compact server reference batches with exact totals", () => {
    const batch = { targets: [{ subflowId: "subflow.checkout", total: 42, hasMore: true, references: [{ id: "route.checkout", name: "Checkout", status: "active", order: 1, conditionLabel: "Always" }] }] };
    expect(routerReferenceSummaryForSubflow(batch, "subflow.checkout")).toEqual({
      references: [{ id: "route.checkout", name: "Checkout", status: "active", order: 1, condition: "Always" }],
      total: 42,
      hasMore: true
    });
  });

});
