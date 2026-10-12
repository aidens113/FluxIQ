// What a step's act made true reaches its plan node (t447,
// `../plan-parameter-resolution.ts`): a domain's resolved answer may carry the
// `effect` of the act the build made on the step's control, and Core writes it
// onto the node as `routeSignatures.effect` -- on a candidate's resolution and
// a draft's alike -- where the build signed no effect of its own. Anything that
// is not a bounded signature refuses the node, as any other malformed answer
// does, and a fact's answer keeps none.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../../../flow-bootstrap/index.ts";
import { AUTOMATION_STUDIO_ROUTE_SIGNATURE_MAX_CHARACTERS, type AutomationStudioRouteSignatures } from "../../../route-state/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../binding.ts";
import { AUTOMATION_STUDIO_PLAN_FACT_TARGET_DEFINITION_ID } from "../plan-fact-targets.ts";
import { AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES as CODES, resolveAutomationStudioFlowBootstrapPlanParameters } from "../plan-parameter-resolution.ts";

type Resolver = NonNullable<AutomationStudioLlmEvidenceRuntimeBinding["resolvePlanNodeParameters"]>;

const START = "https://shop.test/";
/** A domain's effect: opaque to Core, the shape the web host signs. */
const COLLECTED: JsonObject = { v: "web-effect.v1", added: ["0b1c2d3e"], removed: ["9f8e7d6c"] };
const BUILD_SIGNED: JsonObject = { v: "web-effect.v1", added: ["11111111"], removed: [] };

function plan(nodes: Array<{ key: string; handle: string; routeSignatures?: AutomationStudioRouteSignatures }>, successCheck?: string): AutomationStudioFlowBootstrapPlan {
  const planNodes = nodes.map((node) => ({
    key: node.key, definitionId: "domain.demo.press", definitionVersion: "1.0.0", parameters: { target: { handle: node.handle } },
    ...(node.routeSignatures ? { routeSignatures: node.routeSignatures } : {})
  }));
  return {
    schemaVersion: "0.1",
    router: { name: "Press", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{
      key: "primary", name: "Primary", role: "primary", nodes: planNodes, edges: [],
      ...(successCheck ? { metadata: { "fluxiq.successCheck": [{ fact: "exists", op: "exists", target: { handle: successCheck } }] } } : {})
    }]
  };
}

/** Resolves every handle; `effects` names what the act on each handle made true, and `views` adds `handleViews` when asked for the view history. */
function domain(effects: Record<string, unknown>, views = true): Resolver {
  return (input) => {
    const handle = String((input.parameters.target as JsonObject).handle);
    const parameters = { target: { selector: `#${handle}` } };
    const answer: Record<string, unknown> = { status: "resolved", parameters };
    if (views && input.handleReach === "view_history") answer.handleViews = [{ handle, view: 2, location: START }];
    if (Object.hasOwn(effects, handle)) answer.effect = effects[handle];
    return answer as ReturnType<Resolver>;
  };
}

async function resolve(written: AutomationStudioFlowBootstrapPlan, resolver: Resolver, handleReach?: "view_history") {
  return resolveAutomationStudioFlowBootstrapPlanParameters({
    plan: written, projectId: "project.shop", flowId: "flow.coupon", binding: { resolvePlanNodeParameters: resolver }, handlesIssued: true,
    ...(handleReach ? { handleReach } : {})
  });
}

describe("a resolved step's effect", () => {
  it("is written onto a candidate's node as routeSignatures.effect, beside the views its handles came from", async () => {
    const resolved = await resolve(plan([{ key: "n0", handle: "t934" }, { key: "n1", handle: "t12" }]), domain({ t934: COLLECTED }), "view_history");
    if (!resolved.ok) throw new Error(JSON.stringify(resolved.issues));
    const [coupon, other] = resolved.plan.subflows[0]!.nodes;
    expect(coupon!.routeSignatures).toEqual({ effect: COLLECTED });
    expect(coupon!.parameters).toEqual({ target: { selector: "#t934" } });
    expect(other).not.toHaveProperty("routeSignatures");
    expect(resolved.handleViews?.map((view) => view.node)).toEqual(["primary.n0", "primary.n1"]);
  });

  it("is accepted on a draft's resolution too, beside the pages the build signed, and never over the build's own effect", async () => {
    const written = plan([
      { key: "n0", handle: "t934", routeSignatures: { before: { page: "item" } } },
      { key: "n1", handle: "t935", routeSignatures: { before: { page: "item" }, effect: BUILD_SIGNED } }
    ]);
    const resolved = await resolve(written, domain({ t934: COLLECTED, t935: COLLECTED }, false));
    if (!resolved.ok) throw new Error(JSON.stringify(resolved.issues));
    const [added, kept] = resolved.plan.subflows[0]!.nodes;
    expect(added!.routeSignatures).toEqual({ before: { page: "item" }, effect: COLLECTED });
    expect(kept!.routeSignatures).toEqual({ before: { page: "item" }, effect: BUILD_SIGNED });
    // The plan handed in is not changed.
    expect(written.subflows[0]!.nodes[0]!.routeSignatures).toEqual({ before: { page: "item" } });
  });

  it("refuses the node for an effect that is not a bounded signature, as any malformed answer", async () => {
    const oversized = { v: "web-effect.v1", added: ["x".repeat(AUTOMATION_STUDIO_ROUTE_SIGNATURE_MAX_CHARACTERS)] };
    for (const effect of [{}, [], "collected", null, oversized]) {
      const resolved = await resolve(plan([{ key: "n0", handle: "t934" }]), domain({ t934: effect }), "view_history");
      expect(resolved.ok, JSON.stringify(effect).slice(0, 40)).toBe(false);
      if (!resolved.ok) expect(resolved.issues.map((issue) => issue.code)).toEqual([CODES.invalid]);
    }
  });

  it("does not open the door to views nobody asked for", async () => {
    const unasked: Resolver = () => ({ status: "resolved", parameters: { target: { selector: "#x" } }, handleViews: [{ handle: "t934", view: 1, location: START }], effect: COLLECTED });
    const resolved = await resolve(plan([{ key: "n0", handle: "t934" }]), unasked);
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) expect(resolved.issues.map((issue) => issue.code)).toEqual([CODES.invalid]);
  });

  it("is not kept from a fact's answer: a fact is read, never passed over", async () => {
    const both: Resolver = (input) => {
      const handle = String((input.parameters.target as JsonObject).handle);
      // A fact's target is answered as the target itself, a step's as its parameters.
      const parameters = input.nodeDefinitionId === AUTOMATION_STUDIO_PLAN_FACT_TARGET_DEFINITION_ID ? { selector: `#${handle}` } : { target: { selector: `#${handle}` } };
      return { status: "resolved", parameters, effect: COLLECTED } as ReturnType<Resolver>;
    };
    const resolved = await resolve(plan([{ key: "n0", handle: "t934" }], "t5"), both);
    if (!resolved.ok) throw new Error(JSON.stringify(resolved.issues));
    const subflow = resolved.plan.subflows[0]!;
    expect(subflow.metadata?.["fluxiq.successCheck"]).toEqual([{ fact: "exists", op: "exists", target: { selector: "#t5" } }]);
    expect(JSON.stringify(subflow.metadata)).not.toContain("web-effect");
    expect(subflow.nodes[0]!.routeSignatures).toEqual({ effect: COLLECTED });
  });
});
