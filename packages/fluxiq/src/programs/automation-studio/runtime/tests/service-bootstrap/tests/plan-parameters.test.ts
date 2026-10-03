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
//
// A Flow is finished only once a run of the whole Flow from its start was
// judged to do what was asked (t244, user 2026-10-02), and a reply that writes
// the plan out whole with no step run in the build is refused
// `llm_evidence_loop.full_run_required`. So a case that builds a Flow first
// types into the field through the stand-in's own acting tool and adds that
// step: the build's test has a step to run, and -- the stand-in's tool not
// being a node of the library, so Core cannot write its step down -- the plan
// is still the one the reply wrote, which is the plan whose handles this file
// is about (`llm/harness-options/bootstrap-completion.ts`, "The draft wins
// wherever there is one"). The cases whose subject is the completion check's
// refusal never act: the check refuses the plan before a test arises.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";
import { validateAutomationStudioFlowBootstrapPlan } from "../../../flow-bootstrap/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AutomationStudioService } from "../../../service.ts";
import { automationStudioReplayingBinding } from "../../replaying-binding.ts";
import { blankFixture, expectNoTopology, caller, isJudgeRequest, judgeReply, mockProvider, rejectedGenerationDiagnostic, copyDataDirSeed, seedDataDir, type DataDirSeed } from "./fixtures.ts";

const TYPE_ID = "domain.example.type";
/** The stand-in's own tool for typing into a field it showed: not a node of the library. */
const TYPE_TOOL = "example.type_text";
/** The one field the stand-in domain showed the model, and what it really is. */
const NAME_FIELD = { handle: "target.1", locator: "[name=\"name\"]" };

let tempRoot: string;
type Fixture = Awaited<ReturnType<typeof blankFixture>>;

// Every case needs a blank project. Writing one through the service costs about a
// second on an idle machine and several under load, inside each case's 15 s budget,
// so it is written once per file by a closed service and each case runs on its own copy.
const SEEDING_TIMEOUT_MS = 60_000;
let seedRoot: string;
/** One blank `example`-domain project. */
let example: DataDirSeed<Fixture>;

/** Copies a seed into this case's data directory; call it before any service there is constructed. */
async function seeded<T>(seed: DataDirSeed<T>): Promise<T> {
  return structuredClone(await copyDataDirSeed(seed, tempRoot));
}

const services = new Set<AutomationStudioService>();

beforeAll(async () => {
  seedRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-bootstrap-parameters-seed-"));
  example = await seedDataDir(path.join(seedRoot, "example"), (instance) => blankFixture(instance, "active", "example"));
}, SEEDING_TIMEOUT_MS);

afterAll(async () => {
  if (seedRoot) await rm(seedRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

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

/**
 * The stand-in domain: one observing tool, one typing tool, and a resolver
 * that only runs what it showed.
 */
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
    tools: [
      { toolId: "example.inspect", description: "Inspect the fields in view.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } },
      { toolId: TYPE_TOOL, description: "Type text into a field in view.", inputSchema: { type: "object" }, effect: "mutate" }
    ],
    executeTool: async ({ toolId }) => toolId === TYPE_TOOL
      ? { kind: "llm_evidence_tool_execution" as const, evidence: { typed: true }, effectApplied: true, resultCode: "example.typed" }
      : { fields: [{ handle: NAME_FIELD.handle, label: "Name" }] },
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

/**
 * A creation whose model completes with each plan in turn; the last repeats.
 * With `types`, it first types the name and adds that step, so the Flow has a
 * step its test can run. The judge of a finished build's test says yes, and is
 * counted in `requests`.
 */
async function create(plans: JsonObject[], options: { binding?: AutomationStudioLlmEvidenceRuntimeBinding; maxCallsPerRun?: number; types?: true } = {}) {
  const requests: AutomationStudioLlmTaskRequest[] = [];
  let decided = 0;
  const provider = mockProvider(async (request) => {
    requests.push(request);
    if (isJudgeRequest(request)) return judgeReply();
    const at = decided++;
    const decision: JsonObject = options.types && at === 0
      ? { kind: "tool_call", callId: "call.type", toolId: TYPE_TOOL, input: { field: NAME_FIELD.handle, text: "Ada" }, add: true }
      : { kind: "complete", result: { summary: "Type the name.", plan: plans[Math.min(at - (options.types ? 1 : 0), plans.length - 1)]! } };
    return {
      response: { kind: "evidence_tool_decision", summary: "Fill the form.", decision },
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 }
    };
  });
  const { project, flow } = await seeded(example);
  const instance = new AutomationStudioService({
    dataDir: tempRoot,
    llmProviderResolver: (() => ({ provider, maxCallsPerRun: options.maxCallsPerRun ?? 6 })) as never,
    llmEvidenceRuntime: automationStudioReplayingBinding(options.binding ?? typingBinding())
  }).bindNativeNodeRuntime(typingRuntime());
  services.add(instance);
  const instruction = await instance.getFlowInstruction(project.id, "instruction.build");
  await instance.saveFlowInstruction(project.id, { ...instruction!, body: "Type Ada as the name into the form field.", updatedAt: Date.now() });
  const generation = instance.generateFlowBootstrapAdaptation({
    projectId: project.id,
    flowId: flow.flowId,
    evidenceGuided: true,
    caller: caller()
  });
  return { instance, project, flow, requests, generation };
}

/** The refusal the model was shown before the n-th decision, if any. */
function feedbackBefore(requests: AutomationStudioLlmTaskRequest[], call: number): JsonObject | undefined {
  const evidence = requests[call - 1]?.context.evidenceLoop?.evidence ?? [];
  return evidence.filter((item) => item.toolId === "core.completion_check").at(-1)?.value as JsonObject | undefined;
}

describe("creating a Flow whose nodes name what the exploration showed", () => {
  it("builds the node with the parameter the domain resolved from the handle", async () => {
    const run = await create([typingPlan({ handle: NAME_FIELD.handle })], { types: true });
    const result = await run.generation;

    // The typing step, the completion, then the judge of the Flow's test, twice (a build-finishing yes is confirmed by a second call: murwcmx2, C-H).
    expect(run.requests).toHaveLength(4);
    expect(run.requests.map(isJudgeRequest)).toEqual([false, false, true, true]);
    const stored = await run.instance.getFlowBootstrapAdaptation(run.project.id, run.flow.flowId, result.adaptationId);
    const node = stored!.buildPlan.plan.subflows[0]!.nodes.find((item) => item.key === "enter_name");
    expect(node?.parameters).toEqual({ selector: NAME_FIELD.locator, text: "Ada" });
    const graphNode = stored!.topology.subflows[0]!.graphFlow.nodes.find((item) => item.definitionId === TYPE_ID);
    expect(graphNode?.parameterValues).toMatchObject({ selector: NAME_FIELD.locator, text: "Ada" });
    expect(JSON.stringify(stored)).not.toContain("\"handle\"");
  });

  it("builds a node whose handle carries the location it was seen at", async () => {
    const located = typingBinding();
    const resolvePlanNodeParameters = vi.fn(located.resolvePlanNodeParameters!);
    const run = await create([typingPlan({ handle: NAME_FIELD.handle, location: "https://form.example.test/step-2" })], { binding: { ...located, resolvePlanNodeParameters }, types: true });
    await expect(run.generation).resolves.toMatchObject({ status: "proposed" });
    expect(resolvePlanNodeParameters).toHaveBeenCalledWith(expect.objectContaining({
      nodeDefinitionId: TYPE_ID,
      parameters: { selector: { handle: NAME_FIELD.handle, location: "https://form.example.test/step-2" }, text: "Ada" }
    }));
  });

  it("hands a guessed locator back to the model, and builds the corrected plan", async () => {
    const run = await create([typingPlan("input[name=\"Name\"]"), typingPlan({ handle: NAME_FIELD.handle })], { types: true });
    const result = await run.generation;

    // The typing step, the refused plan, the corrected one, then the judge of the Flow's test, twice (a build-finishing yes is confirmed by a second call: murwcmx2, C-H).
    expect(run.requests).toHaveLength(5);
    expect(run.requests.map(isJudgeRequest)).toEqual([false, false, false, true, true]);
    expect(feedbackBefore(run.requests, 2)).toBeUndefined();
    expect(feedbackBefore(run.requests, 3)).toMatchObject({
      ok: false,
      refusal: "flow_bootstrap.evidence_completion_parameters_unresolved",
      issues: [{ code: "example.locator_not_observed", path: "plan.subflows.0.nodes.1.parameters" }]
    });
    // The model is shown codes and plan paths, never page content.
    expect(JSON.stringify(feedbackBefore(run.requests, 3))).not.toContain("input[name");
    const stored = await run.instance.getFlowBootstrapAdaptation(run.project.id, run.flow.flowId, result.adaptationId);
    expect(stored!.buildPlan.plan.subflows[0]!.nodes[1]!.parameters).toEqual({ selector: NAME_FIELD.locator, text: "Ada" });
    // The free look, the typing step, the refused plan, the corrected one.
    expect(stored!.evidenceTrace?.map((step) => step.decision)).toEqual(["tool_call", "tool_call", "unusable", "complete"]);
  });

  it("hands a plan the registry refuses back to the model, and builds the corrected plan", async () => {
    const run = await create([typingPlan({ handle: NAME_FIELD.handle }, UNREADABLE_TEXT), typingPlan({ handle: NAME_FIELD.handle })], { types: true });
    await expect(run.generation).resolves.toMatchObject({ status: "proposed" });

    expect(feedbackBefore(run.requests, 3)).toMatchObject({
      refusal: "flow_bootstrap.evidence_completion_plan_invalid",
      issues: [{ code: "bootstrap.invalid_parameter_value", path: expect.stringContaining("parameters.text") }]
    });
  });

  // It used to stop after three, and three was wrong: a model correcting one
  // mistake at a time is making progress, and the guard ended builds that were
  // working. It keeps asking now until what the build may spend runs out -- here
  // the run's own call count -- and still says which check refused the last
  // plan and never creates anything.
  it("keeps asking past three refused plans, spends what the run allows, and says which check refused the last", async () => {
    const run = await create([typingPlan({ handle: NAME_FIELD.handle }, UNREADABLE_TEXT)]);
    const diagnostic = await rejectedGenerationDiagnostic(run.generation);

    expect(run.requests.length).toBeGreaterThan(3);
    // Nothing in the Flow never ends a build while budget remains (t208): it ends at the run's declared call count,
    // said as that budget, and still names the check that refused the last plan.
    expect(diagnostic).toMatchObject({
      code: "flow_bootstrap.evidence_budget_exhausted",
      ending: { kind: "budget_exhausted", bound: "calls", tried: { stepsInFlow: 0 } },
      stage: "provider_output_validation",
      providerInvocation: "attempted",
      issueCodes: ["bootstrap.invalid_parameter_value"]
    });
    await expectNoTopology(run.instance, run.project.id, run.flow.flowId);
    await expect(run.instance.listFlowAdaptationSummaries({ projectId: run.project.id, limit: 10, offset: 0 })).resolves.toMatchObject({ total: 0 });
  });

  it("stops on a handle the domain never issued, with the domain's code, and creates nothing", async () => {
    const run = await create([typingPlan({ handle: "target.99" })]);
    const diagnostic = await rejectedGenerationDiagnostic(run.generation);

    expect(diagnostic).toMatchObject({ code: "flow_bootstrap.evidence_budget_exhausted", ending: { bound: "calls" }, issueCodes: ["example.handle_unknown"] });
    await expectNoTopology(run.instance, run.project.id, run.flow.flowId);
  });

  it("refuses a handle when the domain bound no resolver", async () => {
    const run = await create([typingPlan({ handle: NAME_FIELD.handle })], { binding: typingBinding(false) });
    const diagnostic = await rejectedGenerationDiagnostic(run.generation);

    expect(diagnostic).toMatchObject({ code: "flow_bootstrap.evidence_budget_exhausted", ending: { bound: "calls" }, issueCodes: ["bootstrap.handle_resolution_unavailable"] });
  });

  // The streak is never longer than the calls the run allows, so a build
  // whose every call was refused still ends under the refusal's name.
  it("names the last refusal when a build's calls all go on refused plans", async () => {
    const run = await create([typingPlan({ handle: "target.99" }), typingPlan({ handle: NAME_FIELD.handle }, UNREADABLE_TEXT)], { maxCallsPerRun: 2 });
    const diagnostic = await rejectedGenerationDiagnostic(run.generation);

    expect(run.requests).toHaveLength(2);
    expect(diagnostic).toMatchObject({ code: "flow_bootstrap.evidence_budget_exhausted", ending: { bound: "calls" }, issueCodes: ["bootstrap.invalid_parameter_value"], evidenceLoop: { iterationCount: 2 } });
  });

  it("refuses to persist a plan that still names a handle, however it arrives", async () => {
    const run = await create([typingPlan({ handle: NAME_FIELD.handle })], { types: true });
    await expect(run.generation).resolves.toMatchObject({ status: "proposed" });
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
