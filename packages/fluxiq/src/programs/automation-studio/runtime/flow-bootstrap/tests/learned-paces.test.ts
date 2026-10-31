// The paces a build's trials learned (P6, CC8, t799): recorded from the
// attempts a trial ran, by the step's identity, and written onto a plan.
import { describe, expect, it } from "vitest";
import type { AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../plan/index.ts";
import { AutomationStudioLearnedPaces } from "../learned-paces.ts";

const attempt = (nodeId: string, raisedToMs?: number, extra: Partial<AutomationStudioNodeAttemptTrace> = {}): AutomationStudioNodeAttemptTrace =>
  ({ attemptId: `${nodeId}.a`, nodeId, definitionId: "web.output.dom-click", startedAt: 1, status: "failed", inputs: {}, outputs: {}, effects: [], ...(raisedToMs === undefined ? {} : { pace: { inForceMs: 0, waitedMs: 0, raisedToMs } }), ...extra }) as AutomationStudioNodeAttemptTrace;

const graph = { nodes: [{ id: "n1", parameterValues: { target: { selector: "#renew" }, ensureState: { s: 1 } } }, { id: "n2", parameterValues: { target: { selector: "#hold" } } }] };

const plan = (nodes: Array<{ key: string; selector: string; paceMs?: number }>): AutomationStudioFlowBootstrapPlan => ({
  schemaVersion: "0.1", router: { name: "R", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
  subflows: [{ key: "primary", name: "Primary", role: "primary", edges: [], nodes: nodes.map((node) => ({ key: node.key, definitionId: "web.output.dom-click", definitionVersion: "1.0.0", parameters: { target: { selector: node.selector } }, ...(node.paceMs ? { paceMs: node.paceMs } : {}) })) }]
} as AutomationStudioFlowBootstrapPlan);

describe("the record of learned paces", () => {
  it("keeps a step's identity without ensureState and the most its pace was raised to", () => {
    const paces = new AutomationStudioLearnedPaces();
    paces.trial([attempt("n1", 1_000), attempt("n1", 1_500), attempt("n2"), attempt("gone", 4_000)], graph);

    expect(paces.list()).toEqual([{ definitionId: "web.output.dom-click", parameters: { target: { selector: "#renew" } }, paceMs: 1_500 }]);
  });

  it("writes the pace onto the matching step only, rounded up to 100 ms, and answers the same plan when nothing changes", () => {
    const paces = new AutomationStudioLearnedPaces();
    paces.trial([attempt("n1", 1_250)], graph);
    const written = plan([{ key: "a", selector: "#renew" }, { key: "b", selector: "#hold" }]);

    const lowered = paces.lower(written);
    expect(lowered.subflows[0]!.nodes.map((node) => node.paceMs)).toEqual([1_300, undefined]);
    expect(written.subflows[0]!.nodes[0]!.paceMs).toBeUndefined();
    expect(paces.lower(lowered)).toBe(lowered);
    expect(new AutomationStudioLearnedPaces().lower(written)).toBe(written);
  });

  it("keeps a pace the step already has when it is longer than the one learned, and raises a shorter one", () => {
    const paces = new AutomationStudioLearnedPaces();
    paces.trial([attempt("n1", 1_250)], graph);
    const lowered = paces.lower(plan([{ key: "a", selector: "#renew", paceMs: 5_000 }, { key: "b", selector: "#renew", paceMs: 500 }]));

    expect(lowered.subflows[0]!.nodes.map((node) => node.paceMs)).toEqual([5_000, 1_300]);
  });

  it("is the environment's own record when it carries one, else one kept for the environment", () => {
    const own = new AutomationStudioLearnedPaces();
    expect(AutomationStudioLearnedPaces.of({ exploredPaces: own })).toBe(own);
    const environment = {};
    expect(AutomationStudioLearnedPaces.of(environment)).toBe(AutomationStudioLearnedPaces.of(environment));
  });
});
