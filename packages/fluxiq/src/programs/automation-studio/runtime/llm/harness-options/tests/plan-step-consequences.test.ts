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
//
// The last group is the one that matters most, because it is the only place
// the whole carrier is checked in one piece. A build no longer writes its Flow
// out as prose: it runs the library's nodes and the Flow is assembled from the
// steps that ran (`llm/node-tools/`). So the declaration has to travel from
// the `run_node` call that made the step, through the draft, through the
// assembler, onto the node -- and arrive here as the classes a person is asked
// about. Every joint of that was built by a different task, and until these
// rows nothing put them together.

import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { assembleAutomationStudioFlowDraftPlan, type AutomationStudioFlowBootstrapPlan } from "../../../flow-bootstrap/index.ts";
import { webDomainNodeDefinitionsFixture } from "../../../flow-bootstrap/plan/tests/index.ts";
import { automationStudioFlowBootstrapDraftNodeStep, AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID } from "../../node-tools/index.ts";
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

describe("the declaration's journey from the call that ran the node to the step Core reads", () => {
  const registry = new AutomationStudioNodeRegistry(webDomainNodeDefinitionsFixture());
  const resolution = {
    scope: { kind: "domain" as const, domainId: "web-automation" },
    runtimeCapabilities: ["web.actions"],
    permissions: ["web-automation.action"]
  };

  /** A step exactly as a `run_node` call leaves it on the draft. */
  function ran(consequences: string[] | undefined): AutomationStudioFlowDraftStep {
    return {
      position: 1,
      iteration: 1,
      callId: "call.1",
      actionId: "web.output.dom-click",
      toolId: AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID,
      input: { node: "web.output.dom-click", parameters: { selector: "#schedule" }, ...(consequences ? { consequences } : {}) },
      effect: "mutate",
      effectApplied: true,
      proposes: true,
      disposition: "kept"
    };
  }

  function nodeFrom(consequences: string[] | undefined) {
    const assembled = assembleAutomationStudioFlowDraftPlan({
      steps: [ran(consequences)],
      write: automationStudioFlowBootstrapDraftNodeStep,
      registry,
      resolution,
      summary: "Schedule the post"
    });
    expect(assembled.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    return assembled.plan?.subflows[0]?.nodes[0];
  }

  it("carries what the call declared onto the assembled node, and Core reads it back as its own classes", () => {
    const node = nodeFrom(["send_or_publish"]);

    // The node the Flow would run, with the declaration beside its parameters
    // rather than among them.
    expect(node?.definitionId).toBe("web.output.dom-click");
    expect(node?.parameters?.selector).toBe("#schedule");
    expect(node?.consequences).toEqual(["send_or_publish"]);

    const step = automationStudioPlanStepConsequences(node);
    expect(step.declared).toEqual(["send_or_publish"]);
    expect(step.parameters[AUTOMATION_STUDIO_PLAN_STEP_CONSEQUENCES_KEY]).toBeUndefined();
  });

  it("keeps a call that declared nothing lasting distinct from one that said nothing", () => {
    // `[]` on the call becomes the word `none` in the written step, which the
    // authoring reader turns back into `[]` on the node. It has to survive as
    // a statement: a step that declared nothing would be refused by the domain,
    // and refusing a press the model already said was harmless would stop every
    // build that dismisses a banner.
    const declaredHarmless = nodeFrom([]);
    expect(declaredHarmless?.consequences).toEqual([]);
    expect(automationStudioPlanStepConsequences(declaredHarmless).declared).toEqual([]);

    // A call with no declaration at all leaves the node with none, and Core
    // reports the silence rather than reading it as harmless.
    const saidNothing = nodeFrom(undefined);
    expect(saidNothing?.consequences).toBeUndefined();
    expect(automationStudioPlanStepConsequences(saidNothing).declared).toBeUndefined();
  });

  it("carries several classes from one call", () => {
    const node = nodeFrom(["create_new", "send_or_publish"]);

    // In Core's own order, whatever order the call wrote them in.
    expect(automationStudioPlanStepConsequences(node).declared).toEqual(["send_or_publish", "create_new"]);
  });
});
