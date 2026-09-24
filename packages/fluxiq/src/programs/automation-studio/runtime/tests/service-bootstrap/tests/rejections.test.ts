import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import { AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS } from "../../../flow-bootstrap/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import type { AutomationStudioLlmProviderResolverInput, AutomationStudioServiceOptions } from "../../../service.ts";
import { AutomationStudioService } from "../../../service.ts";
import { plan, mockProvider, blankFixture, grant, expectNoTopology, rejectedGenerationDiagnostic } from "./fixtures.ts";

let tempRoot: string;

const services = new Set<AutomationStudioService>();

function createService(input: {
  provider?: AutomationStudioLlmProvider;
  resolver?: (input: AutomationStudioLlmProviderResolverInput) => unknown | Promise<unknown>;
  revoke?: (grantId: string) => void;
  evidenceRuntime?: NonNullable<AutomationStudioServiceOptions["llmEvidenceRuntime"]>;
  reusableLlmContext?: NonNullable<AutomationStudioServiceOptions["reusableLlmContext"]>;
} = {}) {
  const provider = input.provider ?? mockProvider();
  const resolver = input.resolver ?? (() => ({
    provider,
    tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 2_000, maxTotalTokens: 10_000 },
    maxCallsPerRun: 1,
    maxEstimatedCostUsd: 0.1,
    timeoutMs: 20_000
  }));
  const instance = new AutomationStudioService({
    dataDir: tempRoot,
    llmProviderResolver: resolver as any,
    ...(input.evidenceRuntime ? { llmEvidenceRuntime: input.evidenceRuntime } : {}),
    ...(input.reusableLlmContext ? { reusableLlmContext: input.reusableLlmContext } : {}),
    ...(input.revoke ? { revokeLlmExecutionGrant: input.revoke } : {})
  });
  services.add(instance);
  return instance;
}

describe("AutomationStudioService generateFlowBootstrapAdaptation", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-flow-bootstrap-generation-"));
  });

  afterEach(async () => {
    await Promise.all([...services].map((instance) => instance.close()));
    services.clear();
    await rm(tempRoot, { recursive: true, force: true });
  });

  // A completed result that fails a check is handed back to the model with the
  // reasons, as a refused plan is a model failure and not the end of the build.
  // One that keeps failing stops on the unusable-decision streak -- here the
  // grant's three calls -- and the record names the check that refused it.
  //
  // What is refused here is what carries no intent to read: a result that says
  // nothing, a plan with no step in it, and a plan past a bound Core cannot
  // shrink. A spelling Core can read -- an extra key, a wrong schema version, a
  // summary one character too long -- is normalised rather than refused
  // (`flow-bootstrap/authoring/`), and the cases below no longer include one.
  it.each([
    ["wrapper shape", "flow_bootstrap.evidence_completion_wrapper_invalid", "bootstrap.completion_wrapper_invalid", () => ({})],
    ["plan structure", "flow_bootstrap.evidence_completion_plan_invalid", "bootstrap.subflow_has_no_nodes", () => ({ summary: "Candidate.", plan: { subflows: [{ key: "primary", name: "Primary", role: "primary", nodes: [], edges: [] }] } })],
    ["evidence profile limits", "flow_bootstrap.evidence_completion_profile_limit_exceeded", "bootstrap.completion_profile_limit_exceeded", () => ({
      summary: "Candidate.",
      plan: {
        ...plan(),
        subflows: [{
          ...plan().subflows[0],
          nodes: Array.from({ length: AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS.maxNodesPerSubflow + 1 }, (_unused, index) => ({ key: `n${index}`, definitionId: "builtin.control.end", definitionVersion: "1.0.0" })),
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
    const instance = createService({
      provider,
      resolver: () => ({ provider, maxCallsPerRun: 3 }),
      evidenceRuntime: {
        domainId: "test.domain", deniedEvidenceKeys: [], tools: [{ toolId: "inspect", description: "Inspect bounded evidence.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } }],
        executeTool: vi.fn().mockResolvedValue({ factCount: 1 })
      }
    });
    const { project, flow } = await blankFixture(instance);

    const diagnostic = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      executionGrant: await grant(instance, project.id, flow.flowId),
      evidenceGuided: true
    }));

    expect(requests).toHaveLength(3);
    const feedback = requests[1]?.context.evidenceLoop?.evidence.find((item) => item.toolId === "core.completion_check")?.value;
    expect(feedback).toMatchObject({ ok: false, refusal: expectedRefusal, issues: expect.arrayContaining([expect.objectContaining({ code: expectedIssue })]) });
    expect(diagnostic).toMatchObject({
      code: "flow_bootstrap.evidence_unusable_decision",
      stage: "provider_output_validation",
      retryable: false,
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
    ["wrong purpose", "flow_bootstrap.invalid_input", (value: Record<string, unknown>) => { (value.executionGrant as Record<string, unknown>).purpose = "diagnosis_only"; }],
    ["stale digest", "flow_bootstrap.stale_grant_binding", (value: Record<string, unknown>) => { (value.executionGrant as Record<string, unknown>).executionDigest = "0".repeat(64); }],
    ["stale settings revision", "flow_bootstrap.stale_grant_binding", (value: Record<string, unknown>) => { (value.executionGrant as Record<string, unknown>).settingsRevision = 999; }],
    ["runtime flags", "flow_bootstrap.invalid_input", (value: Record<string, unknown>) => { value.authorizedExternalSideEffects = true; }],
    ["grant flags", "flow_bootstrap.invalid_input", (value: Record<string, unknown>) => { (value.executionGrant as Record<string, unknown>).dryRun = true; }]
  ])("rejects %s before provider resolution or invocation", async (_label, expectedCode, mutate) => {
    const providerRun = vi.fn();
    const resolver = vi.fn().mockReturnValue({ provider: mockProvider(providerRun) });
    const revoke = vi.fn();
    const instance = createService({ resolver, revoke });
    const { project, flow } = await blankFixture(instance);
    const input: Record<string, unknown> = {
      projectId: project.id,
      flowId: flow.flowId,
      executionGrant: await grant(instance, project.id, flow.flowId)
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
    expect(revoke).toHaveBeenCalledTimes(1);
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
      executionGrant: await grant(instance, project.id, flow.flowId)
    })).rejects.toThrow("Flow Bootstrap generation failed (flow_bootstrap.active_instructions_required).");
    expect(resolver).not.toHaveBeenCalled();
    expect(providerRun).not.toHaveBeenCalled();
    await expectNoTopology(instance, project.id, flow.flowId);
  });

  it("rejects nonblank topology and an empty catalog before provider resolution", async () => {
    const resolver = vi.fn();
    const nonblank = createService({ resolver });
    const first = await blankFixture(nonblank);
    await nonblank.createFlowSubflow({ projectId: first.project.id, flowId: first.flow.flowId, name: "Existing", role: "primary" });
    const nonblankDiagnostic = await rejectedGenerationDiagnostic(nonblank.generateFlowBootstrapAdaptation({
      projectId: first.project.id,
      flowId: first.flow.flowId,
      executionGrant: await grant(nonblank, first.project.id, first.flow.flowId)
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
    const second = await blankFixture(emptyCatalog);
    (emptyCatalog as any).nativeNodeRuntime = {
      sdk: { nodes: new AutomationStudioNodeRegistry([]) },
      getRuntimeCapabilities: () => [],
      getRegistryResolution: (scope: unknown) => ({ scope, runtimeCapabilities: [], permissions: [] })
    };
    const catalogDiagnostic = await rejectedGenerationDiagnostic(emptyCatalog.generateFlowBootstrapAdaptation({
      projectId: second.project.id,
      flowId: second.flow.flowId,
      executionGrant: await grant(emptyCatalog, second.project.id, second.flow.flowId)
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
    const instance = createService({ provider: mockProvider(providerRun) });
    const { project, flow } = await blankFixture(instance);
    const firstGrant = await grant(instance, project.id, flow.flowId);
    await instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, executionGrant: firstGrant });
    const secondGrant = { ...await grant(instance, project.id, flow.flowId), grantId: "llm-grant:second" };

    await expect(instance.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      executionGrant: secondGrant
    })).rejects.toThrow("Flow Bootstrap generation failed (flow_bootstrap.pending_adaptation_exists).");
    expect(providerRun).toHaveBeenCalledTimes(1);
    await expectNoTopology(instance, project.id, flow.flowId);
  });

  it("detects a persisted pending duplicate after service restart without another provider call", async () => {
    const first = createService();
    const { project, flow } = await blankFixture(first);
    await first.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      executionGrant: await grant(first, project.id, flow.flowId)
    });
    await first.close();
    services.delete(first);

    const providerRun = vi.fn();
    const resolver = vi.fn().mockReturnValue({ provider: mockProvider(providerRun) });
    const reloaded = createService({ resolver });
    await expect(reloaded.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      executionGrant: { ...await grant(reloaded, project.id, flow.flowId), grantId: "llm-grant:reloaded" }
    })).rejects.toThrow("Flow Bootstrap generation failed (flow_bootstrap.pending_adaptation_exists).");
    expect(resolver).not.toHaveBeenCalled();
    expect(providerRun).not.toHaveBeenCalled();
    await expectNoTopology(reloaded, project.id, flow.flowId);
  });

  it("fails closed on grant/key resolver rejection without invoking a provider", async () => {
    const providerRun = vi.fn();
    const resolver = vi.fn().mockRejectedValue(new Error("LLM key is no longer valid."));
    const instance = createService({ resolver, provider: mockProvider(providerRun) });
    const { project, flow } = await blankFixture(instance);

    await expect(instance.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      executionGrant: await grant(instance, project.id, flow.flowId)
    })).rejects.toThrow("Flow Bootstrap generation failed (flow_bootstrap.provider_resolution_failed).");
    expect(providerRun).not.toHaveBeenCalled();
    await expectNoTopology(instance, project.id, flow.flowId);
  });
});
