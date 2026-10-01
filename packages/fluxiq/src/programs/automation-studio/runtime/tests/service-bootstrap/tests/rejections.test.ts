import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import { automationStudioFlowBootstrapSizeLimits } from "../../../flow-bootstrap/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import type { AutomationStudioLlmProviderResolverInput, AutomationStudioServiceOptions } from "../../../service.ts";
import { AutomationStudioService } from "../../../service.ts";
import { plan, mockProvider, blankFixture, caller, expectNoTopology, rejectedGenerationDiagnostic, copyDataDirSeed, seedDataDir, blankFixturesPerService, type DataDirSeed } from "./fixtures.ts";

let tempRoot: string;
type Fixture = Awaited<ReturnType<typeof blankFixture>>;

// Every case needs a blank project. Writing one through the service costs about a
// second on an idle machine and several under load, inside each case's 15 s budget,
// so it is written once per file by a closed service and each case runs on its own copy.
const SEEDING_TIMEOUT_MS = 60_000;
let seedRoot: string;
/** One blank project with no domain. */
let single: DataDirSeed<Fixture>;
/** Two blank projects in one data directory, each written by a service of its own. */
let pair: DataDirSeed<[Fixture, Fixture]>;

/** Copies a seed into this case's data directory; call it before any service there is constructed. */
async function seeded<T>(seed: DataDirSeed<T>): Promise<T> {
  return structuredClone(await copyDataDirSeed(seed, tempRoot));
}

const services = new Set<AutomationStudioService>();

function createService(input: {
  provider?: AutomationStudioLlmProvider;
  resolver?: (input: AutomationStudioLlmProviderResolverInput) => unknown | Promise<unknown>;
  evidenceRuntime?: NonNullable<AutomationStudioServiceOptions["llmEvidenceRuntime"]>;
  reusableLlmContext?: NonNullable<AutomationStudioServiceOptions["reusableLlmContext"]>;
} = {}) {
  const provider = input.provider ?? mockProvider();
  const resolver = input.resolver ?? (() => ({
    provider,
    tokenLimits: { maxInputTokens: 992_000, maxOutputTokens: 8_000, maxTotalTokens: 1_000_000 },
    maxCallsPerRun: 1,
    maxEstimatedCostUsd: 0.1,
    timeoutMs: 20_000
  }));
  const instance = new AutomationStudioService({
    dataDir: tempRoot,
    llmProviderResolver: resolver as any,
    ...(input.evidenceRuntime ? { llmEvidenceRuntime: input.evidenceRuntime } : {}),
    ...(input.reusableLlmContext ? { reusableLlmContext: input.reusableLlmContext } : {})
  });
  services.add(instance);
  return instance;
}

describe("AutomationStudioService generateFlowBootstrapAdaptation", () => {
  beforeAll(async () => {
    seedRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-flow-bootstrap-seed-"));
    single = await seedDataDir(path.join(seedRoot, "single"), (instance) => blankFixture(instance));
    const pairDir = path.join(seedRoot, "pair");
    pair = await seedDataDir(pairDir, async (instance) => await blankFixturesPerService(pairDir, instance, 2) as [Fixture, Fixture]);
  }, SEEDING_TIMEOUT_MS);

  afterAll(async () => {
    if (seedRoot) await rm(seedRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-flow-bootstrap-generation-"));
  });

  afterEach(async () => {
    await Promise.all([...services].map((instance) => instance.close()));
    services.clear();
    await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  // A completed result that fails a check is handed back to the model with the
  // reasons, as a refused plan is a model failure and not the end of the build.
  // One that keeps failing stops on the unusable-decision streak -- here the
  // resolution's three calls -- and the record names the check that refused it.
  //
  // What is refused here is what carries no intent to read: a result that says
  // nothing, a plan with no step in it, and a plan past a bound Core cannot
  // shrink. A spelling Core can read -- an extra key, a wrong schema version, a
  // summary one character too long -- is normalised rather than refused
  // (`flow-bootstrap/authoring/`), and the cases below no longer include one.
  it.each([
    ["wrapper shape", "flow_bootstrap.evidence_completion_wrapper_invalid", "bootstrap.completion_wrapper_invalid", () => ({})],
    ["plan structure", "flow_bootstrap.evidence_completion_plan_invalid", "bootstrap.subflow_has_no_nodes", () => ({ summary: "Candidate.", plan: { subflows: [{ key: "primary", name: "Primary", role: "primary", nodes: [], edges: [] }] } })],
    // One reply's shape: more Subflows than a reply may carry. A Subflow's node
    // count is the Flow's size setting, which the structural parse holds a plan
    // to first; it is the next case.
    ["evidence profile limits", "flow_bootstrap.evidence_completion_profile_limit_exceeded", "bootstrap.completion_profile_limit_exceeded", () => ({
      summary: "Candidate.",
      plan: {
        ...plan(),
        subflows: Array.from({ length: 5 }, (_unused, index) => ({
          key: index === 0 ? "primary" : `part_${index}`, name: `Part ${index}`, role: index === 0 ? "primary" : "utility",
          nodes: [{ key: `n${index}`, definitionId: "builtin.control.end", definitionVersion: "1.0.0" }], edges: []
        }))
      }
    })],
    ["Flow size", "flow_bootstrap.evidence_completion_plan_invalid", "bootstrap.invalid_nodes", () => ({
      summary: "Candidate.",
      plan: {
        ...plan(),
        subflows: [{
          ...plan().subflows[0],
          nodes: Array.from({ length: automationStudioFlowBootstrapSizeLimits().maxNodesPerSubflow + 1 }, (_unused, index) => ({ key: `n${index}`, definitionId: "builtin.control.end", definitionVersion: "1.0.0" })),
          edges: []
        }]
      }
    })],
    ["registry validation", "flow_bootstrap.evidence_completion_plan_invalid", "bootstrap.definition_unavailable", () => ({
      summary: "Candidate.",
      plan: {
        ...plan(),
        subflows: [{
          ...plan().subflows[0],
          nodes: [{ key: "missing", definitionId: "missing.definition", definitionVersion: "1.0.0" }],
          edges: []
        }]
      }
    })]
  ])("feeds back, then reports a content-free failure for, invalid %s", async (_label, expectedRefusal, expectedIssue, completion) => {
    const requests: AutomationStudioLlmTaskRequest[] = [];
    const provider = mockProvider(async (request) => (requests.push(request), {
      response: {
        kind: "evidence_tool_decision",
        summary: "Complete candidate.",
        decision: { kind: "complete", result: completion() }
      },
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 }
    }));
    const { project, flow } = await seeded(single);
    const instance = createService({
      provider,
      resolver: () => ({ provider, maxCallsPerRun: 3 }),
      evidenceRuntime: {
        domainId: "test.domain", deniedEvidenceKeys: [], tools: [{ toolId: "inspect", description: "Inspect bounded evidence.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } }],
        executeTool: vi.fn().mockResolvedValue({ factCount: 1 })
      }
    });

    const diagnostic = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      caller: caller(),
      evidenceGuided: true
    }));

    expect(requests).toHaveLength(3);
    const feedback = requests[1]?.context.evidenceLoop?.evidence.find((item) => item.toolId === "core.completion_check")?.value;
    expect(feedback).toMatchObject({ ok: false, refusal: expectedRefusal, issues: expect.arrayContaining([expect.objectContaining({ code: expectedIssue })]) });
    // The three calls the run declares are spent with nothing in the Flow: a budget hit, said with its message (t208).
    expect(diagnostic).toMatchObject({
      code: "flow_bootstrap.evidence_budget_exhausted",
      ending: { kind: "budget_exhausted", bound: "calls", message: expect.stringContaining("its limit of 3 model calls") },
      stage: "provider_output_validation",
      retryable: true,
      providerInvocation: "attempted",
      providerResponse: "received",
      accounting: {
        provider: "mock-production",
        model: "mock-bootstrap",
        inputTokens: 30,
        outputTokens: 15,
        totalTokens: 45
      },
      evidenceLoop: {
        iterationCount: 3,
        // Three decisions and four trace rows: the opening observation is
        // iteration 0 and was never a provider call.
        decisionCount: 3,
        toolCallCount: 1,
        // The opening observation, then each refused plan and the first code that refused it.
        steps: [{ toolId: "inspect" }, ...Array.from({ length: 3 }, () => ({ toolId: "core.decision_unusable", resultCode: expect.any(String) }))]
      },
      issueCodes: expect.arrayContaining([expectedIssue])
    });
    expect(diagnostic.accounting?.estimatedCostUsd).toBeCloseTo(0.003, 9);
    expect(Object.keys(diagnostic)).toEqual(expect.arrayContaining(["code", "stage", "accounting"]));
    expect(JSON.stringify(diagnostic)).not.toMatch(/Candidate|missing\.definition|unexpected/);
    await expectNoTopology(instance, project.id, flow.flowId);
  });

  it.each([
    ["a leftover execution grant", "flow_bootstrap.invalid_input", (value: Record<string, unknown>) => { value.executionGrant = { grantId: "llm-grant:old" }; }],
    ["a missing caller", "flow_bootstrap.invalid_input", (value: Record<string, unknown>) => { delete value.caller; }],
    ["a caller with no session", "flow_bootstrap.invalid_input", (value: Record<string, unknown>) => { delete (value.caller as Record<string, unknown>).actorSessionId; }],
    ["a caller carrying extra fields", "flow_bootstrap.invalid_input", (value: Record<string, unknown>) => { (value.caller as Record<string, unknown>).purpose = "build_and_adapt"; }],
    ["runtime flags", "flow_bootstrap.invalid_input", (value: Record<string, unknown>) => { value.authorizedExternalSideEffects = true; }]
  ])("rejects %s before provider resolution or invocation", async (_label, expectedCode, mutate) => {
    const providerRun = vi.fn();
    const resolver = vi.fn().mockReturnValue({ provider: mockProvider(providerRun) });
    const { project, flow } = await seeded(single);
    const instance = createService({ resolver });
    const input: Record<string, unknown> = {
      projectId: project.id,
      flowId: flow.flowId,
      caller: caller()
    };
    mutate(input);

    const diagnostic = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation(input as any));
    expect(diagnostic).toEqual({
      code: expectedCode,
      stage: "pre_provider_validation",
      retryable: false,
      providerInvocation: "not_attempted",
      providerResponse: "not_received"
    });
    expect(resolver).not.toHaveBeenCalled();
    expect(providerRun).not.toHaveBeenCalled();
    await expectNoTopology(instance, project.id, flow.flowId);
  });

  it.each([
    ["missing", false, "active"],
    ["disabled", true, "disabled"],
    ["out of scope", true, "active"]
  ] as const)("rejects %s instructions before resolving a provider", async (_label, createInstruction, status) => {
    const providerRun = vi.fn();
    const resolver = vi.fn().mockReturnValue({ provider: mockProvider(providerRun) });
    const instance = createService({ resolver });
    const project = await instance.createProject({ name: "Instruction gate" });
    const flow = await instance.createFlow({ projectId: project.id, flowId: "flow.instruction-gate", name: "Blank" });
    if (createInstruction) {
      const now = Date.now();
      await instance.saveFlowInstruction(project.id, {
        schemaVersion: "0.1",
        instructionId: "instruction.gated",
        title: "Gated",
        body: "Build it.",
        scope: _label === "out of scope"
          ? { kind: "flow", projectId: project.id, flowId: "flow.other" }
          : { kind: "flow", projectId: project.id, flowId: flow.flowId },
        priority: 1,
        status,
        requirement: "required",
        createdAt: now,
        updatedAt: now
      });
    }

    await expect(instance.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      caller: caller()
    })).rejects.toThrow("Flow Bootstrap generation failed (flow_bootstrap.active_instructions_required).");
    expect(resolver).not.toHaveBeenCalled();
    expect(providerRun).not.toHaveBeenCalled();
    await expectNoTopology(instance, project.id, flow.flowId);
  });

  it("rejects nonblank topology and an empty catalog before provider resolution", async () => {
    const resolver = vi.fn();
    const [first, second] = await seeded(pair);
    const nonblank = createService({ resolver });
    await nonblank.createFlowSubflow({ projectId: first.project.id, flowId: first.flow.flowId, name: "Existing", role: "primary" });
    const nonblankDiagnostic = await rejectedGenerationDiagnostic(nonblank.generateFlowBootstrapAdaptation({
      projectId: first.project.id,
      flowId: first.flow.flowId,
      caller: caller()
    }));
    expect(nonblankDiagnostic).toEqual({
      code: "flow_bootstrap.blank_target_required",
      stage: "pre_provider_validation",
      retryable: false,
      providerInvocation: "not_attempted",
      providerResponse: "not_received"
    });
    expect(resolver).not.toHaveBeenCalled();

    const emptyCatalog = createService({ resolver });
    (emptyCatalog as any).nativeNodeRuntime = {
      sdk: { nodes: new AutomationStudioNodeRegistry([]) },
      getRuntimeCapabilities: () => [],
      getRegistryResolution: (scope: unknown) => ({ scope, runtimeCapabilities: [], permissions: [] })
    };
    const catalogDiagnostic = await rejectedGenerationDiagnostic(emptyCatalog.generateFlowBootstrapAdaptation({
      projectId: second.project.id,
      flowId: second.flow.flowId,
      caller: caller()
    }));
    expect(catalogDiagnostic).toEqual({
      code: "flow_bootstrap.node_catalog_unavailable",
      stage: "pre_provider_validation",
      retryable: false,
      providerInvocation: "not_attempted",
      providerResponse: "not_received"
    });
    expect(resolver).not.toHaveBeenCalled();
  });

  it("rejects a second pending proposal before another provider call", async () => {
    const providerRun = vi.fn(async () => ({
      response: { kind: "flow_bootstrap", summary: "Build once.", plan: plan() }
    }));
    const { project, flow } = await seeded(single);
    const instance = createService({ provider: mockProvider(providerRun) });
    await instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, caller: caller() });

    await expect(instance.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      caller: caller()
    })).rejects.toThrow("Flow Bootstrap generation failed (flow_bootstrap.pending_adaptation_exists).");
    expect(providerRun).toHaveBeenCalledTimes(1);
    await expectNoTopology(instance, project.id, flow.flowId);
  });

  it("detects a persisted pending duplicate after service restart without another provider call", async () => {
    const { project, flow } = await seeded(single);
    const first = createService();
    await first.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      caller: caller()
    });
    await first.close();
    services.delete(first);

    const providerRun = vi.fn();
    const resolver = vi.fn().mockReturnValue({ provider: mockProvider(providerRun) });
    const reloaded = createService({ resolver });
    await expect(reloaded.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      caller: caller()
    })).rejects.toThrow("Flow Bootstrap generation failed (flow_bootstrap.pending_adaptation_exists).");
    expect(resolver).not.toHaveBeenCalled();
    expect(providerRun).not.toHaveBeenCalled();
    await expectNoTopology(reloaded, project.id, flow.flowId);
  });

  it("fails closed on key resolver rejection without invoking a provider", async () => {
    const providerRun = vi.fn();
    const resolver = vi.fn().mockRejectedValue(new Error("LLM key is no longer valid."));
    const { project, flow } = await seeded(single);
    const instance = createService({ resolver, provider: mockProvider(providerRun) });

    await expect(instance.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      caller: caller()
    })).rejects.toThrow("Flow Bootstrap generation failed (flow_bootstrap.provider_resolution_failed).");
    expect(providerRun).not.toHaveBeenCalled();
    await expectNoTopology(instance, project.id, flow.flowId);
  });
});
