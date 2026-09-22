// What a step says its own action would lastingly do, and what Core does with it.
//
// The declaration is the only part of the permission seam neither Core nor the
// domain can supply: Core holds the grant but not the page, the domain holds
// the control but not what pressing it means on this site. So the model says
// it, on the step, and these rows pin how Core reads it -- the shapes a Flow
// script can produce, the fail-closed reading of anything else, and the promise
// that the declaration never reaches the node the Flow runs.
//
// The gate itself is `action-permissions/tests/gate.test.ts`; the web domain's
// half is `plan-resolution/tests/plan-step-permission.test.ts` downstream.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowBootstrapPlan } from "../../../flow-bootstrap/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../binding.ts";
import { AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES as CODES, resolveAutomationStudioFlowBootstrapPlanParameters } from "../plan-parameter-resolution.ts";
import { AUTOMATION_STUDIO_PLAN_STEP_CONSEQUENCES_KEY, automationStudioPlanStepConsequences } from "../plan-step-consequences.ts";

type Resolver = NonNullable<AutomationStudioLlmEvidenceRuntimeBinding["resolvePlanNodeParameters"]>;

function plan(parameters: JsonObject): AutomationStudioFlowBootstrapPlan {
  return {
    schemaVersion: "0.1",
    router: { name: "Router", rules: [], fallback: { kind: "fail" } },
    subflows: [{
      key: "primary",
      name: "Primary",
      role: "primary",
      nodes: [{ key: "press", definitionId: "ledger.press", definitionVersion: "1.0.0", parameters }],
      edges: []
    }]
  };
}

async function resolveWith(parameters: JsonObject, resolver?: Resolver) {
  return await resolveAutomationStudioFlowBootstrapPlanParameters({
    plan: plan(parameters),
    projectId: "project.one",
    flowId: "flow.one",
    handlesIssued: true,
    ...(resolver ? { binding: { resolvePlanNodeParameters: resolver } } : {}),
    permissionFor: () => async () => ({ permitted: true })
  });
}

describe("automationStudioPlanStepConsequences", () => {
  it("reads the shapes a Flow script can produce, and leaves the step's own parameters alone", () => {
    expect(automationStudioPlanStepConsequences({ parameters: { target: "t.1", consequences: "send_or_publish, create_new" } }))
      .toEqual({ declared: ["send_or_publish", "create_new"], parameters: { target: "t.1" }, rodeOnParameters: true });
    // The nested plan a model may still return writes an array.
    expect(automationStudioPlanStepConsequences({ parameters: { consequences: ["create_new"] } }).declared).toEqual(["create_new"]);
    // Core's order, whatever order the model wrote them in, so two steps that say the same thing compare equal.
    expect(automationStudioPlanStepConsequences({ parameters: { consequences: "create_new,move_money" } }).declared).toEqual(["move_money", "create_new"]);
    // Case and spacing are the model's, not a meaning.
    expect(automationStudioPlanStepConsequences({ parameters: { consequences: " Send_Or_Publish " } }).declared).toEqual(["send_or_publish"]);
  });

  it("tells a step that said nothing apart from one that said it does nothing", () => {
    expect(automationStudioPlanStepConsequences({ parameters: { target: "t.1" } })).toEqual({ parameters: { target: "t.1" }, rodeOnParameters: false });
    expect(automationStudioPlanStepConsequences({ parameters: { consequences: "none" } }).declared).toEqual([]);
    expect(automationStudioPlanStepConsequences({ parameters: { consequences: "" } }).declared).toEqual([]);
    expect(automationStudioPlanStepConsequences({ parameters: { consequences: [] } }).declared).toEqual([]);
  });

  it("is not a declaration when Core cannot read it as its own classes", () => {
    for (const written of ["publish it", "purchase", 3, null, { move_money: true }, ["send_or_publish", "posting"], Array(11).fill("delete")]) {
      expect(automationStudioPlanStepConsequences({ parameters: { consequences: written as never } }).malformed).toBe(true);
    }
  });

  it("names one spelling for the whole system", () => {
    expect(AUTOMATION_STUDIO_PLAN_STEP_CONSEQUENCES_KEY).toBe("consequences");
  });
});

describe("a step's declaration through plan resolution", () => {
  it("reaches the domain as classes, and never reaches the node as a parameter", async () => {
    const seen: Array<readonly string[] | undefined> = [];
    const resolver: Resolver = ({ parameters, declaredConsequences }) => {
      seen.push(declaredConsequences);
      expect(Object.hasOwn(parameters, "consequences")).toBe(false);
      return { status: "resolved", parameters: { ...parameters, ran: true } };
    };
    const resolved = await resolveWith({ target: "t.1", consequences: "delete" }, resolver);

    expect(seen).toEqual([["delete"]]);
    expect(resolved.ok && resolved.plan.subflows[0]?.nodes[0]?.parameters).toEqual({ target: "t.1", ran: true });
  });

  it("takes the declaration off even when the domain leaves the step as written", async () => {
    const resolved = await resolveWith({ target: "t.1", consequences: "none" }, () => ({ status: "unchanged" }));

    // Left on, the registry would refuse the node for a parameter no node has.
    expect(resolved.ok && resolved.plan.subflows[0]?.nodes[0]?.parameters).toEqual({ target: "t.1" });
  });

  it("refuses a step whose declaration it could not read, rather than resolving it as though it had said nothing", async () => {
    const resolved = await resolveWith({ target: "t.1", consequences: "publish it" }, () => ({ status: "unchanged" }));

    expect(resolved.ok).toBe(false);
    expect(resolved.ok === false && resolved.issues.map((issue) => issue.code)).toEqual([CODES.consequences]);
  });

  it("carries a domain's needs_permission under its own code, with the classes and the request", async () => {
    const resolver: Resolver = () => ({ status: "needs_permission", missing: ["move_money"], requestId: "permission-request:one" });
    const resolved = await resolveWith({ target: "t.1", consequences: "move_money" }, resolver);

    expect(resolved.ok).toBe(false);
    const issue = resolved.ok === false ? resolved.issues[0] : undefined;
    expect(issue?.code).toBe(CODES.permission);
    expect(issue?.message).toBe("A step would do something lasting the run is not permitted (move_money); request permission-request:one asks for them.");
  });

  it("refuses a step that says it is not permitted and names nothing, because that is not an answer", async () => {
    const resolver: Resolver = () => ({ status: "needs_permission", missing: [], requestId: null });
    const resolved = await resolveWith({ target: "t.1", consequences: "move_money" }, resolver);

    expect(resolved.ok === false && resolved.issues.map((issue) => issue.code)).toEqual([CODES.refused]);
  });

  it("has nobody to ask when no domain is bound, so a lasting step is still not built", async () => {
    const resolved = await resolveWith({ target: "t.1", consequences: "delete" });

    expect(resolved.ok).toBe(false);
    const issue = resolved.ok === false ? resolved.issues[0] : undefined;
    expect(issue?.code).toBe(CODES.permission);
    expect(issue?.message).toContain("nobody was there to ask");
  });

  it("still builds a step that declared nothing lasting when no domain is bound", async () => {
    const resolved = await resolveWith({ target: "t.1", consequences: "none" });

    expect(resolved.ok && resolved.plan.subflows[0]?.nodes[0]?.parameters).toEqual({ target: "t.1" });
  });
});
