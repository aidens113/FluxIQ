// A step a build created knows its own effect, so a run passes it over as
// done when the page already shows it (t447, `r4b-coupon-step-identity.md` F2).
//
// R4a and R4b saved their "collect the store coupon" step with no route
// signatures at all: a candidate's plan carries none the model wrote, and
// nothing else gave it one. In the same browser session the coupon stays
// "Collected", so a replay met a page where the step's control no longer
// existed and failed it, though its act was done. The whole path is held here,
// from the domain's answer to the run: the plan's handles are resolved as a
// candidate submission's are (`../../../llm/harness-options/plan-parameter-resolution.ts`),
// the domain answering the coupon step with what exploration's act on it made
// true; the plan is validated and laid out as a Flow
// (`../../../flow-bootstrap/adaptation.ts`); and that Flow runs against a fake
// host whose page either shows the effect or does not. The effect only ever
// skips: a lasting act that already ran is never pressed again because of one.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { createBlankAutomationStudioFlowArtifact, type AutomationStudioFlowDocument } from "../../../../model/index.ts";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import { normalizeAutomationStudioFlowBuildPlan, validateAutomationStudioFlowBootstrapPlan, type AutomationStudioFlowBootstrapPlan } from "../../../flow-bootstrap/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../flow-bootstrap/plan/tests/index.ts";
import { resolveAutomationStudioFlowBootstrapPlanParameters, type AutomationStudioLlmEvidenceRuntimeBinding } from "../../../llm/harness-options/index.ts";
import { automationStudioNodeRouteSignatures } from "../../../route-state/index.ts";
import { runAutomationStudioGraph, type AutomationStudioGraphExecutionOptions } from "../../index.ts";

type Host = NonNullable<AutomationStudioGraphExecutionOptions["hostRuntime"]>;
type Resolver = NonNullable<AutomationStudioLlmEvidenceRuntimeBinding["resolvePlanNodeParameters"]>;
type NodeExecutor = NonNullable<AutomationStudioGraphExecutionOptions["nativeNodeExecutor"]>;

const registry = new AutomationStudioNodeRegistry(webDomainNodeDefinitionsFixture());
const resolution = { scope: { kind: "domain" as const, domainId: "web-automation" }, runtimeCapabilities: ["web.actions"], permissions: ["web-automation.action"] };
const CLICK = "web.output.dom-click";
/** The effect the domain answers for the coupon step: opaque to Core, tested only by the host. */
const COLLECTED: JsonObject = { shows: "Collected" };

/** open -> coupon -> add: three presses, the coupon a lasting act; `signed` gives the coupon the pages a draft's build would sign. */
function plan(signed?: { before: string; after: string }): AutomationStudioFlowBootstrapPlan {
  const press = (key: string, handle: string, extra: object = {}) => ({ key, definitionId: CLICK, definitionVersion: "1.0.0", outputActionId: "web.dom.click", parameters: { target: { handle } }, ...extra });
  const nodes = [
    press("open", "t10", { consequences: [] }),
    press("coupon", "t934", { consequences: ["create_new"], ...(signed ? { routeSignatures: { before: { page: signed.before }, after: { page: signed.after } } } : {}) }),
    press("add", "t20", { consequences: [] })
  ];
  const edges = [["open", "coupon"], ["coupon", "add"]].map(([from, to]) => ({ key: `${from}-${to}`, source: { nodeKey: from!, portId: "success" }, target: { nodeKey: to!, portId: "in" } }));
  return { schemaVersion: "0.1", router: { name: "Coupon", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } }, subflows: [{ key: "primary", name: "Primary", role: "primary", nodes, edges }] };
}

/** The domain: each handle names `#<handle>`; the coupon's answer carries what exploration's act on it made true. */
const domain: Resolver = (input) => {
  const handle = String((input.parameters.target as JsonObject).handle);
  return { status: "resolved", parameters: { selector: `#${handle}` }, ...(handle === "t934" ? { effect: COLLECTED } : {}) };
};

/** The Flow the build saves, from the model's plan to the laid-out graph, and its node ids by plan key. */
async function savedFlow(signed?: { before: string; after: string }): Promise<{ flow: AutomationStudioFlowDocument; id: Record<string, string> }> {
  const resolved = await resolveAutomationStudioFlowBootstrapPlanParameters({
    plan: plan(signed), projectId: "project.coupon", flowId: "flow.coupon", binding: { resolvePlanNodeParameters: domain }, handlesIssued: true, handleReach: "view_history", writtenByModel: true
  });
  if (!resolved.ok) throw new Error(JSON.stringify(resolved.issues));
  const validated = validateAutomationStudioFlowBootstrapPlan({ plan: resolved.plan, registry, resolution });
  if (!validated.validated) throw new Error(validated.issues.map((issue) => issue.code).join(", "));
  const topology = normalizeAutomationStudioFlowBuildPlan({
    adaptationId: "adaptation.bootstrap.0b9d2c4e-1f3a-4c5d-8e6f-7a8b9c0d1e2f",
    parentFlow: createBlankAutomationStudioFlowArtifact({ flowId: "flow.coupon", projectId: "project.coupon", name: "Coupon", now: 1 }),
    buildPlan: validated.validated, sourceInstructionIds: ["instruction.1"], now: 1
  });
  const flow = topology.subflows[0]!.graphFlow as unknown as AutomationStudioFlowDocument;
  const id = Object.fromEntries(flow.nodes.map((node) => [String(node.metadata?.bootstrapSymbolicKey), node.id]));
  return { flow, id };
}

/** A page by name; the host reads it as the route state, matches a recorded page the observed one starts with, and holds an effect the page's name shows. */
type Page = { current: string };
function host(page: Page, asked: { holds: number } = { holds: 0 }): Host {
  return {
    capabilities: [],
    observeRouteState: () => ({ page: page.current }),
    signRouteState: (state) => ({ page: String(state.page) }),
    compareRouteSignatures: (recorded, observed) => (String(observed.page).startsWith(String(recorded.page)) ? { matches: true, closeness: 1 } : { matches: false, closeness: 0 }),
    routeEffectHolds: (effect, observed) => {
      asked.holds += 1;
      return String(observed.page).includes(String(effect.shows));
    }
  };
}

/**
 * Runs each step's press. The coupon's control reads "Get coupons" until it is
 * pressed and "Collected" after, so its saved control ("Get coupons") is not
 * found on a page that already holds the coupon. `fails` names a step whose
 * control is never found, and `then` the page that leaves.
 */
function presses(page: Page, id: Record<string, string>, calls: string[], fails?: { key: string; then: string }): NodeExecutor {
  const keyOf = (nodeId: string) => Object.keys(id).find((key) => id[key] === nodeId) ?? nodeId;
  return async (request) => {
    const key = keyOf(request.node.id);
    calls.push(key);
    const missing = (key === "coupon" && page.current.includes("Collected")) || key === fails?.key;
    if (missing) {
      if (fails && key === fails.key) page.current = fails.then;
      return { result: { status: "failed", route: "failed", outputs: {}, message: "No target resolved.", failure: { category: "target_not_found", code: "web.target.not_found", retryable: true, stage: "target_resolution" } } };
    }
    if (key === "coupon") page.current = `${page.current}:Collected`;
    return { result: { status: "success", route: "success", outputs: {} } };
  };
}

const options = (page: Page, nativeNodeExecutor: NodeExecutor, asked?: { holds: number }): AutomationStudioGraphExecutionOptions => ({
  delay: async () => undefined, hostRuntime: host(page, asked), nativeNodeExecutor
});

describe("a step a build created, whose effect the page may already show", () => {
  it("is saved with the effect its act made true, and only that step", async () => {
    const { flow, id } = await savedFlow();
    const byKey = (key: string) => automationStudioNodeRouteSignatures(flow.nodes.find((node) => node.id === id[key])!);
    expect(byKey("coupon")).toEqual({ effect: COLLECTED });
    expect(byKey("open")).toEqual({});
    expect(byKey("add")).toEqual({});
  });

  it("is passed over as already done at playback when the page shows its effect, and the run goes on", async () => {
    const { flow, id } = await savedFlow();
    const page: Page = { current: "item:Collected" };
    const calls: string[] = [];
    const asked = { holds: 0 };
    const trace = await runAutomationStudioGraph(flow, options(page, presses(page, id, calls), asked));

    expect(trace.status).toBe("succeeded");
    const coupon = trace.attempts.find((attempt) => attempt.nodeId === id.coupon)!;
    expect(coupon).toMatchObject({ status: "succeeded", stateRouting: { outcome: "effect_holds", toNodeId: id.add, direction: "forward" } });
    expect(coupon).not.toHaveProperty("failure");
    expect(coupon).not.toHaveProperty("recoveryDecision");
    // Looked for once, never pressed, and the steps either side ran.
    expect(calls).toEqual(["open", "coupon", "add"]);
    expect(asked.holds).toBe(1);
  });

  it("runs when the page does not show its effect", async () => {
    const { flow, id } = await savedFlow();
    const page: Page = { current: "item" };
    const calls: string[] = [];
    const trace = await runAutomationStudioGraph(flow, options(page, presses(page, id, calls)));

    expect(trace.status).toBe("succeeded");
    const coupon = trace.attempts.find((attempt) => attempt.nodeId === id.coupon)!;
    expect(coupon).toMatchObject({ status: "succeeded", route: "success" });
    expect(coupon).not.toHaveProperty("stateRouting");
    expect(coupon).not.toHaveProperty("skipped");
    expect(page.current).toBe("item:Collected");
    expect(calls).toEqual(["open", "coupon", "add"]);
  });

  it("never sends a run back to press a lasting act again, whether or not the page shows its effect", async () => {
    for (const then of ["item", "item:Collected"]) {
      // A draft's build signed the coupon's pages (its after-state with a notice since gone), so a later step that cannot run matches its start.
      const { flow, id } = await savedFlow({ before: "item", after: "item:Collected:notice" });
      expect(automationStudioNodeRouteSignatures(flow.nodes.find((node) => node.id === id.coupon)!).effect).toEqual(COLLECTED);
      const page: Page = { current: "item" };
      const calls: string[] = [];
      const trace = await runAutomationStudioGraph(flow, options(page, presses(page, id, calls, { key: "add", then })));

      expect(calls.filter((call) => call === "coupon"), then).toHaveLength(1);
      const add = trace.attempts.filter((attempt) => attempt.nodeId === id.add);
      expect(add.length).toBeGreaterThan(0);
      // Refused both ways: an effect on the page ("item:Collected") is proof the act landed, and none shown is no proof it did not.
      for (const attempt of add) expect(attempt, then).toMatchObject({ status: "failed", stateRouting: { outcome: "no_match", refused: [{ toNodeId: id.coupon, guard: "repeats_lasting_act", nodeId: id.coupon }] } });
    }
  });
});
