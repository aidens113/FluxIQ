import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { createBlankAutomationStudioFlowArtifact } from "../../../../model/index.ts";
import { AutomationStudioNodeRegistry, resolveAutomationStudioNodeActionEffect, type AutomationStudioNodeActionEffect, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY } from "../../../executor/index.ts";
import { automationStudioFlowBootstrapActionPermissions, normalizeAutomationStudioFlowBuildPlan, type AutomationStudioFlowBootstrapPlan } from "../../../flow-bootstrap/index.ts";
import { AUTOMATION_STUDIO_PLAN_PARAMETER_ISSUE_CODES as CODES, checkAutomationStudioFlowBootstrapCompletion, resolveAutomationStudioFlowBootstrapPlanParameters, type AutomationStudioLlmEvidenceRuntimeBinding } from "../../../llm/index.ts";
import { AutomationStudioActionPermissionGate, type AutomationStudioActionDeclaration, type AutomationStudioActionPermissionCheck } from "../../index.ts";

type Resolver = NonNullable<AutomationStudioLlmEvidenceRuntimeBinding["resolvePlanNodeParameters"]>;
const MONEY: AutomationStudioNodeActionEffect = { effectClass: "commit", permissionConsequences: ["move_money"] };
const CLAIM: AutomationStudioActionDeclaration = { consequences: [], effect: "observe", control: { name: "Refund", kind: "button" }, verb: "press" };
const RESOLUTION = { scope: { kind: "domain" as const, domainId: "ledger" }, runtimeCapabilities: [], permissions: [] };

function definition(actionEffect?: AutomationStudioNodeActionEffect): AutomationStudioNodeDefinition {
  const value: AutomationStudioNodeDefinition = {
    schemaVersion: "0.1", id: "ledger.refund", version: "1.0.0", label: "Refund", description: "Refund an entry.", category: "custom",
    source: { kind: "importer", domainId: "ledger", implementationKey: "refund" }, availability: { kind: "domain", domainId: "ledger" },
    capabilities: { executable: true }, inputs: [], outputs: [], parameters: [{ id: "apply", label: "Apply", valueType: "boolean", defaultValue: false }]
  };
  if (actionEffect !== undefined) value.actionEffect = actionEffect;
  return value;
}

function plan(parameters: JsonObject = {}, consequences?: string[]): AutomationStudioFlowBootstrapPlan {
  const node: AutomationStudioFlowBootstrapPlan["subflows"][number]["nodes"][number] = { key: "refund", definitionId: "ledger.refund", definitionVersion: "1.0.0", parameters };
  if (consequences !== undefined) node.consequences = consequences;
  return {
    schemaVersion: "0.1", router: { name: "Refund", rules: [], fallback: { kind: "subflow", targetSubflowKey: "main" } },
    subflows: [{ key: "main", name: "Main", role: "primary", nodes: [node], edges: [] }]
  };
}

function gate(permittedConsequences: readonly string[] = []) {
  return new AutomationStudioActionPermissionGate({ stage: "authoring", permittedConsequences, newRequestId: () => "permission-request:plan" });
}

const declared: Resolver = async ({ permission }) => {
  const answer = await permission(CLAIM);
  return answer.permitted ? { status: "unchanged" } : { status: "needs_permission", missing: [...answer.missing], requestId: answer.requestId };
};

function resolve(inputPlan: AutomationStudioFlowBootstrapPlan, registry: AutomationStudioNodeRegistry | undefined, permission: AutomationStudioActionPermissionCheck, resolver: Resolver = declared) {
  return resolveAutomationStudioFlowBootstrapPlanParameters({
    plan: inputPlan, projectId: "project.ledger", flowId: "flow.refund", registry, handlesIssued: true,
    binding: { resolvePlanNodeParameters: resolver }, permissionFor: () => permission
  });
}

describe("the canonical client floor through actual plan resolution", () => {
  it("checks a canonical known class even when the domain's legacy declaration says observe and none", async () => {
    const run = gate();
    const result = await resolve(plan({}, []), new AutomationStudioNodeRegistry([definition(MONEY)]), run.checkFor({ kind: "flow_step", id: "ledger.refund", ref: "main.refund" }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues.map(issue => issue.code)).toEqual([CODES.permission]);
    expect(run.request).toMatchObject({ consequences: ["move_money"], missing: ["move_money"], control: { name: null } });
    expect(run.declarations[0]).toMatchObject({ action: { effect: "mutate" }, consequences: ["move_money"] });
  });

  it("cannot publish when the resolver ignores a refused permission callback", async () => {
    const run = gate();
    const result = await resolve(plan({}, []), new AutomationStudioNodeRegistry([definition(MONEY)]), run.checkFor({ kind: "flow_step", id: "ledger.refund", ref: "main.refund" }), async ({ permission }) => {
      expect((await permission(CLAIM)).permitted).toBe(false);
      return { status: "unchanged" };
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues[0]?.code).toBe(CODES.permission);
    expect(run.declarations).toHaveLength(1);
  });

  it.each([false, true])("refuses unchecked known classes without inventing a control or grant (resolver bound: %s)", async (bound) => {
    const run = gate(["move_money"]);
    const result = await resolveAutomationStudioFlowBootstrapPlanParameters({
      plan: plan({}, []), registry: new AutomationStudioNodeRegistry([definition(MONEY)]), projectId: "project.ledger", flowId: "flow.refund", handlesIssued: true,
      binding: bound ? { resolvePlanNodeParameters: () => ({ status: "unchanged" }) } : undefined,
      permissionFor: () => run.checkFor({ kind: "flow_step", id: "ledger.refund", ref: "main.refund" })
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.issues[0]).toMatchObject({ code: CODES.permission, message: "A step would do something lasting the run is not permitted (move_money); nobody was there to ask." });
    expect(run.declarations).toEqual([]);
    expect(run.request).toBeUndefined();
  });

  it("resolves the floor from an unresolved raw predicate before the domain drops it", async () => {
    const run = gate();
    const result = await resolve(plan({ apply: { binding: "flow.apply" } }, ["delete"]), new AutomationStudioNodeRegistry([definition({ effectClass: "observe", commitWhen: "apply" })]), run.checkFor({ kind: "flow_step", id: "ledger.refund", ref: "main.refund" }), async ({ permission, parameters }) => {
      expect(parameters.apply).toEqual({ binding: "flow.apply" });
      await permission(CLAIM);
      return { status: "resolved", parameters: {} };
    });
    expect(result.ok).toBe(false);
    expect(run.request?.missing).toEqual(["delete"]);
    expect(run.declarations[0]?.consequences).toEqual(["delete"]);
  });

  it("accepts the trusted runtime callback with raw parameters and no model metadata", async () => {
    const trusted = definition(MONEY);
    const inputPlan = plan({ apply: { binding: "flow.apply" } }, []);
    Object.assign(inputPlan.subflows[0]!.nodes[0]!, { metadata: { actionEffect: { effectClass: "observe", permissionConsequences: [] } } });
    const seen: JsonObject[] = [];
    const run = gate();
    const result = await resolveAutomationStudioFlowBootstrapPlanParameters({
      plan: inputPlan, projectId: "project.ledger", flowId: "flow.refund", handlesIssued: true,
      resolveActionEffect: (node, parameters) => {
        expect(node.definitionId).toBe("ledger.refund");
        expect(node.metadata).toBeUndefined();
        seen.push(node.parameterValues ?? {});
        return resolveAutomationStudioNodeActionEffect(trusted, parameters);
      },
      binding: { resolvePlanNodeParameters: declared }, permissionFor: () => run.checkFor({ kind: "flow_step", id: "ledger.refund", ref: "main.refund" })
    });
    expect(result.ok).toBe(false);
    expect(seen).toEqual([{ apply: { binding: "flow.apply" } }]);
    expect(run.request?.missing).toEqual(["move_money"]);
  });

  it("preserves optional-registry legacy shape and never trusts a plan's own actionEffect metadata", async () => {
    const inputPlan = plan({}, []);
    Object.assign(inputPlan.subflows[0]!.nodes[0]!, { metadata: { actionEffect: { effectClass: "commit", permissionConsequences: ["move_money"] }, effect: "commit" } });
    const run = gate();
    const result = await resolve(inputPlan, undefined, run.checkFor({ kind: "flow_step", id: "ledger.refund", ref: "main.refund" }), () => ({ status: "unchanged" }));
    expect(result.ok && result.plan).toEqual(inputPlan);
    expect(run.declarations).toEqual([]);
    expect(run.request).toBeUndefined();
  });

  it("keeps a truthful observe floor exempt and a class-only commit free of invented permissions", async () => {
    const readGate = gate();
    const read = await resolve(plan({ apply: false }, ["delete"]), new AutomationStudioNodeRegistry([definition({ effectClass: "observe", commitWhen: "apply" })]), readGate.checkFor({ kind: "flow_step", id: "ledger.refund", ref: "main.refund" }));
    expect(read.ok && read.plan.subflows[0]?.nodes[0]?.consequences).toEqual([]);
    expect(readGate.declarations[0]).toMatchObject({ consequences: [], disregarded: ["delete"], action: { effect: "observe" } });
    const commitGate = gate();
    const commit = await resolve(plan({}, []), new AutomationStudioNodeRegistry([definition({ effectClass: "commit" })]), commitGate.checkFor({ kind: "flow_step", id: "ledger.refund", ref: "main.refund" }), () => ({ status: "unchanged" }));
    expect(commit.ok && commit.plan.subflows[0]?.nodes[0]?.consequences).toEqual([]);
    expect(commitGate.request).toBeUndefined();
  });

  it("retains a client declaration's own floor when no canonical registry was supplied", async () => {
    const run = gate(["move_money", "delete"]);
    const result = await resolve(plan({}, ["delete"]), undefined, run.checkFor({ kind: "flow_step", id: "ledger.refund", ref: "main.refund" }), async ({ permission }) => {
      expect(await permission({ ...CLAIM, actionEffect: { effectClass: "commit", permissionConsequences: ["move_money"] } })).toEqual({ permitted: true });
      return { status: "unchanged" };
    });
    expect(result.ok && result.plan.subflows[0]?.nodes[0]?.consequences).toEqual(["move_money", "delete"]);
    expect(run.declarations[0]?.consequences).toEqual(["move_money", "delete"]);
  });

  it("leaves an unchanged inherited approved step alone", async () => {
    const run = gate();
    let calls = 0;
    const result = await resolveAutomationStudioFlowBootstrapPlanParameters({
      plan: plan(), registry: new AutomationStudioNodeRegistry([definition(MONEY)]), projectId: "project.ledger", flowId: "flow.refund", handlesIssued: true,
      inheritedNodeRefs: new Set(["main.refund"]), binding: { resolvePlanNodeParameters: () => {
        calls += 1;
        return { status: "unchanged" };
      } },
      permissionFor: () => run.checkFor({ kind: "flow_step", id: "ledger.refund", ref: "main.refund" })
    });
    expect(result.ok).toBe(true);
    expect(calls).toBe(0);
    expect(run.declarations).toEqual([]);
  });
});

describe("the accepted permission union through completion and publication projection", () => {
  it("keeps canonical and model classes after authoring approval and graph normalization", async () => {
    const registry = new AutomationStudioNodeRegistry([definition(MONEY)]);
    const permissions = automationStudioFlowBootstrapActionPermissions({ permittedConsequences: ["move_money", "delete"], instructionIds: [], executeTool: async () => ({}) });
    const inputPlan = plan({ apply: false }, ["delete"]);
    Object.assign(inputPlan.subflows[0]!.nodes[0]!, { metadata: { [AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY]: [], actionEffect: { effectClass: "observe", permissionConsequences: [] } } });
    const accepted = await checkAutomationStudioFlowBootstrapCompletion({
      result: { summary: "Refund the entry", plan: JSON.parse(JSON.stringify(inputPlan)) }, projectId: "project.ledger", flowId: "flow.refund", registry, resolution: RESOLUTION,
      binding: { resolvePlanNodeParameters: declared }, permissionFor: permissions.planStep
    });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) throw new Error(JSON.stringify(accepted.issues));
    expect(accepted.buildPlan.plan.subflows[0]?.nodes[0]?.consequences).toEqual(["move_money", "delete"]);
    expect(permissions.declarations()[0]).toMatchObject({ consequences: ["move_money", "delete"], permitted: true });
    // A preserved metadata packet can also reach normalization directly,
    // without passing through the model parser that strips unknown fields.
    Object.assign(accepted.buildPlan.subflows[0]!.nodes[0]!, { metadata: { [AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY]: [], kept: "preserved", actionEffect: { effectClass: "observe", permissionConsequences: [] } } });
    const topology = normalizeAutomationStudioFlowBuildPlan({
      adaptationId: "adaptation.refund", parentFlow: createBlankAutomationStudioFlowArtifact({ projectId: "project.ledger", flowId: "flow.refund", name: "Refund", scope: RESOLUTION.scope, origin: "manual", now: 1 }),
      buildPlan: accepted.buildPlan, sourceInstructionIds: [], now: 2
    });
    expect(topology.subflows[0]?.graphFlow.nodes[0]?.metadata?.[AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY]).toEqual(["move_money", "delete"]);
    expect(topology.subflows[0]?.graphFlow.nodes[0]?.metadata?.kept).toBe("preserved");
  });

  it.each([undefined, []])("preserves legacy absence and explicit empty accepted classes during publication (%j)", async (consequences) => {
    const accepted = await checkAutomationStudioFlowBootstrapCompletion({
      result: { summary: "Read the entry", plan: JSON.parse(JSON.stringify(plan({}, consequences))) },
      projectId: "project.ledger", flowId: "flow.refund", registry: new AutomationStudioNodeRegistry([definition()]), resolution: RESOLUTION,
      binding: { resolvePlanNodeParameters: () => ({ status: "unchanged" }) }
    });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) throw new Error(JSON.stringify(accepted.issues));
    Object.assign(accepted.buildPlan.subflows[0]!.nodes[0]!, { metadata: { [AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY]: ["delete"] } });
    const topology = normalizeAutomationStudioFlowBuildPlan({
      adaptationId: "adaptation.read", parentFlow: createBlankAutomationStudioFlowArtifact({ projectId: "project.ledger", flowId: "flow.refund", name: "Read", scope: RESOLUTION.scope, origin: "manual", now: 1 }),
      buildPlan: accepted.buildPlan, sourceInstructionIds: [], now: 2
    });
    expect(topology.subflows[0]?.graphFlow.nodes[0]?.metadata?.[AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY]).toEqual(consequences ?? ["delete"]);
  });
});
