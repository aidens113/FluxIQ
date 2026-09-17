// A created Flow runs with parameters its domain resolved, and a refused plan
// is a correction the model gets to make.
//
// The live failure these reproduce: the model was shown a form field only as an
// opaque handle, had no way to name it in the plan, guessed a locator
// (`input[name="Name"]`) for a field whose name was `name`, and the Flow failed
// on its first step. The plan that finally validated was the model's guess.
// Now the model names the handle, the bound domain turns it into the real
// parameter before validation, and a plan the domain or the registry refuses is
// handed back to the model with the reasons instead of ending the build.
//
// The domain here is a stand-in with one typing action; the web domain's
// resolver is its own work.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { validateAutomationStudioFlowBootstrapPlan } from "../../../flow-bootstrap/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AutomationStudioService } from "../../../service.ts";
import { blankFixture, expectNoTopology, grant, mockProvider, rejectedGenerationDiagnostic } from "./fixtures.ts";

const TYPE_ID = "domain.example.type";
/** The one field the stand-in domain showed the model, and what it really is. */
const NAME_FIELD = { handle: "target.1", locator: "[name=\"name\"]" };

let tempRoot: string;
const services = new Set<AutomationStudioService>();

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-bootstrap-parameters-"));
});

afterEach(async () => {
  await Promise.all([...services].map((instance) => instance.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

function typingRuntime() {
  const type: AutomationStudioNodeDefinition = {
    schemaVersion: "0.1",
    id: TYPE_ID,
    version: "1.0.0",
    label: "Type text",
    description: "Type text into a field of the active target.",
    category: "action",
    source: { kind: "importer", domainId: "example", packageId: "example.package", implementationKey: "example.type" },
    availability: { kind: "domain", domainId: "example" },
    requiredRuntimeCapabilities: ["example.actions"],
    capabilities: { executable: true, codeBacked: true },
    inputs: [{ id: "in", label: "In", valueType: "any", required: false }],
    outputs: [{ id: "success", label: "Success", valueType: "any" }],
    parameters: [
      { id: "selector", label: "Field", valueType: "string", required: true, constraints: { minLength: 1 } },
      { id: "text", label: "Text", valueType: "string", required: true }
    ],
    outputAction: { fixedOutputId: "example.type" },
    safety: { requiredPermissions: ["example.action"] }
  };
  return new AutomationStudioNativeNodeRuntime({ permissions: ["example.action"], runtimeCapabilities: ["example.actions"] }).register({
    schemaVersion: "0.1",
    sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION,
    packageId: "example.package",
    packageVersion: "1.0.0",
    domainId: "example",
    nodes: [type]
  }, {
    packageId: "example.package",
    packageVersion: "1.0.0",
    implementations: { "example.type": () => ({ status: "success", route: "success", outputs: { success: true } }) }
  });
}

function isHandle(value: JsonValue | undefined): value is { handle: string } {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && typeof (value as JsonObject).handle === "string";
}

/** The stand-in domain: one observing tool, and a resolver that only runs what it showed. */
function typingBinding(resolve = true): AutomationStudioLlmEvidenceRuntimeBinding {
  const resolvePlanNodeParameters: NonNullable<AutomationStudioLlmEvidenceRuntimeBinding["resolvePlanNodeParameters"]> = ({ nodeDefinitionId, parameters }) => {
    if (nodeDefinitionId !== TYPE_ID) return { status: "unchanged" };
    const selector = parameters.selector;
    if (!isHandle(selector)) return { status: "refused", issueCodes: ["example.locator_not_observed"] };
    if (selector.handle !== NAME_FIELD.handle) return { status: "refused", issueCodes: ["example.handle_unknown"] };
    return { status: "resolved", parameters: { ...parameters, selector: NAME_FIELD.locator } };
  };
  return {
    domainId: "example",
    deniedEvidenceKeys: [],
    tools: [{ toolId: "example.inspect", description: "Inspect the fields in view.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } }],
    executeTool: async () => ({ fields: [{ handle: NAME_FIELD.handle, label: "Name" }] }),
    ...(resolve ? { resolvePlanNodeParameters } : {})
  };
}

/**
 * A value for `text` that no reading can make into the string the parameter
 * declares. A number is not one: a model that writes `text: 42` for a string
 * field means "42", and plan authoring reads it that way rather than refusing
 * the build (`flow-bootstrap/authoring/normalise.ts`). An object is, and it is
 * what the refusal cases below use.
 */
const UNREADABLE_TEXT: JsonValue = { value: "Ada" };

function typingPlan(selector: JsonValue, text: JsonValue = "Ada"): JsonObject {
  return {
    schemaVersion: "0.1",
    router: { name: "Form", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
    subflows: [{
      key: "primary",
      name: "Fill the form",
      role: "primary",
      nodes: [
        { key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" },
        { key: "enter_name", definitionId: TYPE_ID, definitionVersion: "1.0.0", parameters: { selector, text }, outputActionId: "example.type" },
        { key: "end", definitionId: "builtin.control.end", definitionVersion: "1.0.0" }
      ],
      edges: [
        { key: "start_type", source: { nodeKey: "start", portId: "next" }, target: { nodeKey: "enter_name", portId: "in" } },
        { key: "type_end", source: { nodeKey: "enter_name", portId: "success" }, target: { nodeKey: "end", portId: "in" } }
      ]
    }]
  };
}

/** A creation whose model completes with each plan in turn; the last repeats. */
async function create(plans: JsonObject[], options: { binding?: AutomationStudioLlmEvidenceRuntimeBinding; maxCallsPerRun?: number } = {}) {
  const requests: AutomationStudioLlmTaskRequest[] = [];
  const provider = mockProvider(async (request) => {
    requests.push(request);
    const plan = plans[Math.min(requests.length, plans.length) - 1]!;
    return {
      response: { kind: "evidence_tool_decision", summary: "Fill the form.", decision: { kind: "complete", result: { summary: "Type the name.", plan } } },
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 }
    };
  });
  const revoke = vi.fn();
  const instance = new AutomationStudioService({
    dataDir: tempRoot,
    llmProviderResolver: (() => ({ provider, maxCallsPerRun: options.maxCallsPerRun ?? 6 })) as never,
    llmEvidenceRuntime: options.binding ?? typingBinding(),
    revokeLlmExecutionGrant: revoke
  }).bindNativeNodeRuntime(typingRuntime());
  services.add(instance);
  const { project, flow } = await blankFixture(instance, "active", "example");
  const instruction = await instance.getFlowInstruction(project.id, "instruction.build");
  await instance.saveFlowInstruction(project.id, { ...instruction!, body: "Type Ada as the name into the form field.", updatedAt: Date.now() });
  const generation = instance.generateFlowBootstrapAdaptation({
    projectId: project.id,
    flowId: flow.flowId,
    evidenceGuided: true,
    executionGrant: await grant(instance, project.id, flow.flowId)
  });
  return { instance, project, flow, requests, revoke, generation };
}

/** The refusal the model was shown before the n-th decision, if any. */
function feedbackBefore(requests: AutomationStudioLlmTaskRequest[], call: number): JsonObject | undefined {
  const evidence = requests[call - 1]?.context.evidenceLoop?.evidence ?? [];
  return evidence.filter((item) => item.toolId === "core.completion_check").at(-1)?.value as JsonObject | undefined;
}

describe("creating a Flow whose nodes name what the exploration showed", () => {
  it("builds the node with the parameter the domain resolved from the handle", async () => {
    const run = await create([typingPlan({ handle: NAME_FIELD.handle })]);
    const result = await run.generation;

    expect(run.requests).toHaveLength(1);
    const stored = await run.instance.getFlowBootstrapAdaptation(run.project.id, run.flow.flowId, result.adaptationId);
    const node = stored!.buildPlan.plan.subflows[0]!.nodes.find((item) => item.key === "enter_name");
    expect(node?.parameters).toEqual({ selector: NAME_FIELD.locator, text: "Ada" });
    const graphNode = stored!.topology.subflows[0]!.graphFlow.nodes.find((item) => item.definitionId === TYPE_ID);
    expect(graphNode?.parameterValues).toMatchObject({ selector: NAME_FIELD.locator, text: "Ada" });
    expect(JSON.stringify(stored)).not.toContain("\"handle\"");
    expect(run.revoke).toHaveBeenCalledTimes(1);
  });

  it("builds a node whose handle carries the location it was seen at", async () => {
    const located = typingBinding();
    const resolvePlanNodeParameters = vi.fn(located.resolvePlanNodeParameters!);
    const run = await create([typingPlan({ handle: NAME_FIELD.handle, location: "https://form.example.test/step-2" })], { binding: { ...located, resolvePlanNodeParameters } });
    await expect(run.generation).resolves.toMatchObject({ status: "proposed" });
    expect(resolvePlanNodeParameters).toHaveBeenCalledWith(expect.objectContaining({
      nodeDefinitionId: TYPE_ID,
      parameters: { selector: { handle: NAME_FIELD.handle, location: "https://form.example.test/step-2" }, text: "Ada" }
    }));
  });

  it("hands a guessed locator back to the model, and builds the corrected plan", async () => {
    const run = await create([typingPlan("input[name=\"Name\"]"), typingPlan({ handle: NAME_FIELD.handle })]);
    const result = await run.generation;

    expect(run.requests).toHaveLength(2);
    expect(feedbackBefore(run.requests, 1)).toBeUndefined();
    expect(feedbackBefore(run.requests, 2)).toMatchObject({
      ok: false,
      refusal: "flow_bootstrap.evidence_completion_parameters_unresolved",
      issues: [{ code: "example.locator_not_observed", path: "plan.subflows.0.nodes.1.parameters" }]
    });
    // The model is shown codes and plan paths, never page content.
    expect(JSON.stringify(feedbackBefore(run.requests, 2))).not.toContain("input[name");
    const stored = await run.instance.getFlowBootstrapAdaptation(run.project.id, run.flow.flowId, result.adaptationId);
    expect(stored!.buildPlan.plan.subflows[0]!.nodes[1]!.parameters).toEqual({ selector: NAME_FIELD.locator, text: "Ada" });
    expect(stored!.evidenceTrace?.map((step) => step.decision)).toEqual(["tool_call", "unusable", "complete"]);
  });

  it("hands a plan the registry refuses back to the model, and builds the corrected plan", async () => {
    const run = await create([typingPlan({ handle: NAME_FIELD.handle }, UNREADABLE_TEXT), typingPlan({ handle: NAME_FIELD.handle })]);
    await expect(run.generation).resolves.toMatchObject({ status: "proposed" });

    expect(feedbackBefore(run.requests, 2)).toMatchObject({
      refusal: "flow_bootstrap.evidence_completion_plan_invalid",
      issues: [{ code: "bootstrap.invalid_parameter_value", path: expect.stringContaining("parameters.text") }]
    });
  });

  it("stops after three refused plans in a row, saying which checks refused them", async () => {
    const run = await create([typingPlan({ handle: NAME_FIELD.handle }, UNREADABLE_TEXT)]);
    const diagnostic = await rejectedGenerationDiagnostic(run.generation);

    expect(run.requests).toHaveLength(3);
    expect(diagnostic).toMatchObject({
      code: "flow_bootstrap.evidence_unusable_decision",
      stage: "provider_output_validation",
      providerInvocation: "attempted",
      issueCodes: ["bootstrap.invalid_parameter_value"],
      accounting: { inputTokens: 300, outputTokens: 150, totalTokens: 450 },
      evidenceLoop: { iterationCount: 3, decisionCount: 4, toolCallCount: 1 }
    });
    await expectNoTopology(run.instance, run.project.id, run.flow.flowId);
    await expect(run.instance.listFlowAdaptationSummaries({ projectId: run.project.id, limit: 10, offset: 0 })).resolves.toMatchObject({ total: 0 });
    expect(run.revoke).toHaveBeenCalledTimes(1);
  });

  it("stops on a handle the domain never issued, with the domain's code, and creates nothing", async () => {
    const run = await create([typingPlan({ handle: "target.99" })]);
    const diagnostic = await rejectedGenerationDiagnostic(run.generation);

    expect(diagnostic).toMatchObject({ code: "flow_bootstrap.evidence_unusable_decision", issueCodes: ["example.handle_unknown"] });
    await expectNoTopology(run.instance, run.project.id, run.flow.flowId);
  });

  it("refuses a handle when the domain bound no resolver", async () => {
    const run = await create([typingPlan({ handle: NAME_FIELD.handle })], { binding: typingBinding(false) });
    const diagnostic = await rejectedGenerationDiagnostic(run.generation);

    expect(diagnostic).toMatchObject({ code: "flow_bootstrap.evidence_unusable_decision", issueCodes: ["bootstrap.handle_resolution_unavailable"] });
  });

  // The streak is never longer than the calls the grant allows, so a build
  // whose every call was refused still ends under the refusal's name.
  it("names the last refusal when a build's calls all go on refused plans", async () => {
    const run = await create([typingPlan({ handle: "target.99" }), typingPlan({ handle: NAME_FIELD.handle }, UNREADABLE_TEXT)], { maxCallsPerRun: 2 });
    const diagnostic = await rejectedGenerationDiagnostic(run.generation);

    expect(run.requests).toHaveLength(2);
    expect(diagnostic).toMatchObject({ code: "flow_bootstrap.evidence_unusable_decision", issueCodes: ["bootstrap.invalid_parameter_value"], evidenceLoop: { iterationCount: 2 } });
  });

  it("refuses to persist a plan that still names a handle, however it arrives", async () => {
    const run = await create([typingPlan({ handle: NAME_FIELD.handle })]);
    await run.generation;
    const other = await run.instance.createFlow({ projectId: run.project.id, flowId: "flow.direct", name: "Direct" });
    const registry = typingRuntime().sdk.nodes;
    const validated = validateAutomationStudioFlowBootstrapPlan({
      plan: typingPlan(NAME_FIELD.locator) as never,
      registry,
      resolution: { scope: { kind: "domain", domainId: "example" }, runtimeCapabilities: ["example.actions"], permissions: ["example.action"] }
    });
    expect(validated.ok).toBe(true);
    const buildPlan = structuredClone(validated.validated!);
    buildPlan.plan.subflows[0]!.nodes[1]!.parameters = { selector: { handle: NAME_FIELD.handle }, text: "Ada" };
    await expect(run.instance.createFlowBootstrapAdaptation({
      projectId: run.project.id,
      flowId: other.flowId,
      baseDependencyDigest: await run.instance.getLlmExecutionDependencyDigest(run.project.id, other.flowId),
      sourceInstructionIds: ["instruction.build"],
      summary: "Smuggled.",
      buildPlan
    })).rejects.toThrow("bootstrap.handle_unresolved");
  });
});
