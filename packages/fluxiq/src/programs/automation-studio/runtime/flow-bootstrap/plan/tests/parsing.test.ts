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

// A plan node's pace (t378): the least time between two of its starts in one
// run, in whole milliseconds. Until t378 the field was `bootstrap.unexpected_field`,
// so neither a script's `repeat pace:` nor a pace a trial learned could reach the
// saved Flow.
describe("a plan node's pace", () => {
  function pacedPlan(paceMs: unknown): Record<string, unknown> {
    const plan = planWith(undefined);
    const node = (plan.subflows as Array<{ nodes: Array<Record<string, unknown>> }>)[0]!.nodes[0]!;
    delete node.routeSignatures;
    node.paceMs = paceMs;
    return plan;
  }

  it("accepts a whole number of milliseconds from 1 ms to ten minutes, and keeps it", () => {
    for (const paceMs of [1, 6_000, 600_000]) {
      const parsed = parseAutomationStudioFlowBootstrapPlan(pacedPlan(paceMs));
      expect(parsed.issues).toEqual([]);
      expect(parsed.plan?.subflows[0]?.nodes[0]?.paceMs).toBe(paceMs);
    }
  });

  it("refuses anything else, naming the node's field", () => {
    for (const paceMs of [0, -5, 1.5, 600_001, "6 s", null]) {
      expect(parseAutomationStudioFlowBootstrapPlan(pacedPlan(paceMs)).issues.map((issue) => `${issue.code} ${issue.path}`), String(paceMs)).toEqual(["bootstrap.invalid_pace plan.subflows.0.nodes.0.paceMs"]);
    }
  });
});
