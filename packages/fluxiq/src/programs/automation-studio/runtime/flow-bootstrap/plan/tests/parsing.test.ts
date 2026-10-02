// A plan node's route signatures (t243): the page its step started on and the
// page it left, as the host signed them. The parser accepts a value the node
// reader would read, and refuses one it would not, by the same test
// (`automationStudioRouteSignaturesValue`), so a plan never carries a value a
// running node would read as nothing.
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_ROUTE_SIGNATURE_MAX_CHARACTERS } from "../../../route-state/index.ts";
import { parseAutomationStudioFlowBootstrapPlan } from "../index.ts";

function planWith(routeSignatures: unknown): Record<string, unknown> {
  return {
    schemaVersion: "0.1",
    router: { name: "Router", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{
      key: "primary",
      name: "Primary",
      role: "primary",
      nodes: [{ key: "s1", definitionId: "web.output.dom-click", definitionVersion: "1.0.0", outputActionId: "web.dom.click", routeSignatures }],
      edges: []
    }]
  };
}

const codes = (value: unknown) => parseAutomationStudioFlowBootstrapPlan(planWith(value)).issues.map((issue) => `${issue.code} ${issue.path}`);

describe("a plan node's route signatures", () => {
  it("accepts a before and an after, or either alone", () => {
    for (const value of [{ before: { at: "/home" }, after: { at: "/search" } }, { before: { at: "/home" } }, { after: { at: "/search" } }]) {
      const parsed = parseAutomationStudioFlowBootstrapPlan(planWith(value));
      expect(parsed.issues).toEqual([]);
      expect(parsed.plan?.subflows[0]?.nodes[0]?.routeSignatures).toEqual(value);
    }
  });

  it("refuses a malformed value, naming the node's field", () => {
    const refused = "bootstrap.invalid_route_signatures plan.subflows.0.nodes.0.routeSignatures";
    expect(codes({})).toEqual([refused]);
    expect(codes("signed")).toEqual([refused]);
    expect(codes({ before: "home" })).toEqual([refused]);
    expect(codes({ before: {} })).toEqual([refused]);
    expect(codes({ before: { at: "/home" }, during: { at: "/x" } })).toEqual([refused]);
    expect(codes({ after: { page: "x".repeat(AUTOMATION_STUDIO_ROUTE_SIGNATURE_MAX_CHARACTERS) } })).toEqual([refused]);
  });

  it("leaves a node without signatures as it was", () => {
    const plan = planWith(undefined);
    delete ((plan.subflows as Array<{ nodes: Array<Record<string, unknown>> }>)[0]!.nodes[0]!).routeSignatures;
    expect(parseAutomationStudioFlowBootstrapPlan(plan).issues).toEqual([]);
  });
});
