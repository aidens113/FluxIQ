import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../core/index.ts";
import {
  AUTOMATION_STUDIO_IMPORTER_SDK_VERSION,
  AutomationStudioNodeRegistry,
  type AutomationStudioNodeDefinition
} from "../nodes/index.ts";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "./llm-harness.ts";
import type {
  AutomationStudioBuildAndAdaptExecutionGrant,
  AutomationStudioLlmProviderResolverInput
} from "./service.ts";
import { AutomationStudioService } from "./service.ts";
import { AutomationStudioNativeNodeRuntime } from "./native-node-runtime.ts";
import { parseAutomationStudioFlowBootstrapGenerationError } from "./flow-bootstrap-generation-failure.ts";

let tempRoot: string;
const services = new Set<AutomationStudioService>();

function plan() {
  return {
    schemaVersion: "0.1" as const,
    router: {
      name: "Instruction router",
      rules: [],
      fallback: { kind: "subflow" as const, targetSubflowKey: "primary" }
    },
    subflows: [{
      key: "primary",
      name: "Primary",
      role: "primary" as const,
      nodes: [
        { key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" },
        { key: "end", definitionId: "builtin.control.end", definitionVersion: "1.0.0" }
      ],
      edges: [{
        key: "start_end",
        source: { nodeKey: "start", portId: "next" },
        target: { nodeKey: "end", portId: "in" }
      }]
    }]
  };
}

function mockProvider(runTask?: (request: AutomationStudioLlmTaskRequest) => Promise<unknown>): AutomationStudioLlmProvider {
  return {
    metadata: { provider: "mock-production", model: "mock-bootstrap" },
    runTask: runTask ?? (async () => ({
      response: { kind: "flow_bootstrap", summary: "Build the active instruction.", plan: plan() },
      usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200, estimatedCostUsd: 0.002 }
    }))
  };
}

function permissionScopedNativeRuntime(permissions: string[]) {
  const action: AutomationStudioNodeDefinition = {
    schemaVersion: "0.1",
    id: "domain.example.click",
    version: "1.0.0",
    label: "Click button",
    description: "Click a button in the active target.",
    category: "action",
    source: {
      kind: "importer",
      domainId: "example",
      packageId: "example.package",
      implementationKey: "example.click"
    },
    availability: { kind: "domain", domainId: "example" },
    requiredRuntimeCapabilities: ["example.actions"],
    capabilities: { executable: true, codeBacked: true },
    inputs: [{ id: "in", label: "In", valueType: "object", required: false }],
    outputs: [{ id: "success", label: "Success", valueType: "boolean" }],
    parameters: [],
    outputAction: { fixedOutputId: "example.click" },
    safety: { requiredPermissions: ["example.action"] }
  };
  return new AutomationStudioNativeNodeRuntime({
    permissions,
    runtimeCapabilities: ["example.actions"]
  }).register({
    schemaVersion: "0.1",
    sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION,
    packageId: "example.package",
    packageVersion: "1.0.0",
    domainId: "example",
    nodes: [action]
  }, {
    packageId: "example.package",
    packageVersion: "1.0.0",
    implementations: {
      "example.click": () => ({
        status: "success",
        route: "success",
        outputs: { success: true }
      })
    }
  });
}
function createService(input: {
  provider?: AutomationStudioLlmProvider;
  resolver?: (input: AutomationStudioLlmProviderResolverInput) => unknown | Promise<unknown>;
  revoke?: (grantId: string) => void;
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
    ...(input.revoke ? { revokeLlmExecutionGrant: input.revoke } : {})
  });
  services.add(instance);
  return instance;
}

async function blankFixture(
  instance: AutomationStudioService,
  instructionStatus: "active" | "disabled" | "archived" = "active",
  domainId?: string
) {
  const project = await instance.createProject({ name: "LLM Bootstrap Generation", ...(domainId ? { domainId } : {}) });
  const flow = await instance.createFlow({ projectId: project.id, flowId: "flow.generated", name: "Blank Flow" });
  const now = Date.now();
  await instance.saveFlowInstruction(project.id, {
    schemaVersion: "0.1",
    instructionId: "instruction.build",
    title: "Build a primary path",
    body: "Create a deterministic Start to End Flow.",
    scope: { kind: "flow", projectId: project.id, flowId: flow.flowId },
    priority: 100,
    status: instructionStatus,
    requirement: "required",
    tags: ["generation"],
    createdAt: now,
    updatedAt: now
  });
  return { project, flow };
}

async function grant(instance: AutomationStudioService, projectId: string, flowId: string): Promise<AutomationStudioBuildAndAdaptExecutionGrant> {
  const binding = await instance.getLlmExecutionBinding(projectId, flowId);
  return {
    grantId: "llm-grant:test",
    actorUserId: "user.test",
    actorSessionId: "session.test",
    purpose: "build_and_adapt",
    executionDigest: binding.executionDigest,
    settingsRevision: binding.settingsRevision
  };
}

async function expectNoTopology(instance: AutomationStudioService, projectId: string, flowId: string) {
  await expect(instance.getFlowRouter(projectId, flowId)).resolves.toBeNull();
  await expect(instance.listFlowSubflowSummaries({ projectId, flowId, limit: 10, offset: 0 }))
    .resolves.toMatchObject({ total: 0 });
}

async function rejectedGenerationDiagnostic(promise: Promise<unknown>) {
  try {
    await promise;
    throw new Error("Expected Flow Bootstrap generation to reject.");
  } catch (error) {
    const diagnostic = parseAutomationStudioFlowBootstrapGenerationError(error);
    expect(diagnostic).not.toBeNull();
    expect((error as Error).message).toBe("Flow Bootstrap generation failed (" + diagnostic!.code + ").");
    return diagnostic!;
  }
}

function successfulHarnessResult(buildPlan: unknown = plan()) {
  return {
    ok: true,
    request: { requestId: "request.phase", estimatedInputTokens: 321 },
    response: { kind: "flow_bootstrap", summary: "Build the active instruction.", plan: buildPlan },
    provider: { provider: "mock-production", model: "mock-bootstrap" },
    usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200, estimatedCostUsd: 0.002 },
    diagnostics: []
  };
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

  it("does not mark a missing or control-only native registry as bootstrap-ready", () => {
    const instance = createService();
    expect(instance.getFlowBootstrapGenerationRuntimeReadiness()).toEqual({
      providerResolverConfigured: true,
      nativeNodeRegistryConfigured: false
    });
    (instance as any).nativeNodeRuntime = new AutomationStudioNativeNodeRuntime();
    expect(instance.getFlowBootstrapGenerationRuntimeReadiness()).toEqual({
      providerResolverConfigured: true,
      nativeNodeRegistryConfigured: false
    });
  });

  it("uses the grant-resolved bounded provider and persists one sanitized pending proposal without topology mutation", async () => {
    const requests: AutomationStudioLlmTaskRequest[] = [];
    const provider = mockProvider(async (request) => {
      requests.push(request);
      return {
        response: { kind: "flow_bootstrap", summary: "Build the active instruction.", plan: plan() },
        usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200, estimatedCostUsd: 0.002 }
      };
    });
    const resolver = vi.fn().mockReturnValue({
      provider,
      tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 2_000, maxTotalTokens: 10_000 },
      maxCallsPerRun: 1,
      maxEstimatedCostUsd: 0.1,
      timeoutMs: 20_000
    });
    const revoke = vi.fn();
    const instance = createService({ provider, resolver, revoke });
    const { project, flow } = await blankFixture(instance);
    const executionGrant = await grant(instance, project.id, flow.flowId);

    const result = await instance.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      executionGrant
    });

    expect(resolver).toHaveBeenCalledWith({ projectId: project.id, flowId: flow.flowId, executionGrant });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      taskKind: "flow_bootstrap",
      expectedOutput: "flow_bootstrap",
      context: {
        instructions: { instructionIds: ["instruction.build"] },
        flowBootstrap: { outputSchema: { kind: "flow_bootstrap" } }
      }
    });
    expect(JSON.stringify(requests[0])).not.toMatch(/recording|timeline/i);
    expect(result).toMatchObject({
      projectId: project.id,
      flowId: flow.flowId,
      status: "proposed",
      sourceInstructionIds: ["instruction.build"],
      baseDependencyDigest: executionGrant.executionDigest,
      baseSettingsRevision: executionGrant.settingsRevision,
      accounting: {
        provider: "mock-production",
        model: "mock-bootstrap",
        inputTokens: 120,
        outputTokens: 80,
        totalTokens: 200,
        estimatedCostUsd: 0.002
      }
    });
    expect(Object.keys(result).sort()).toEqual([
      "accounting",
      "adaptationId",
      "baseDependencyDigest",
      "baseSettingsRevision",
      "flowId",
      "projectId",
      "riskLevel",
      "sourceInstructionIds",
      "status"
    ]);
    expect(JSON.stringify(result)).not.toMatch(/plan|instruction body|grantId|secret|keyId/i);
    await expect(instance.getFlowBootstrapAdaptation(project.id, flow.flowId, result.adaptationId))
      .resolves.toMatchObject({ status: "proposed", baseSettingsRevision: executionGrant.settingsRevision });
    await expectNoTopology(instance, project.id, flow.flowId);
    expect(revoke).toHaveBeenCalledWith(executionGrant.grantId);
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

  it("persists no proposal on provider or output validation failure and revokes the grant", async () => {
    const revoke = vi.fn();
    const provider = mockProvider(async () => ({
      response: {
        kind: "flow_bootstrap",
        summary: "Invalid",
        plan: { ...plan(), recordingId: "forbidden" } as unknown as JsonObject
      }
    }));
    const instance = createService({ provider, revoke });
    const { project, flow } = await blankFixture(instance);
    const executionGrant = await grant(instance, project.id, flow.flowId);

    await expect(instance.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      executionGrant
    })).rejects.toThrow(/generation failed/);
    await expectNoTopology(instance, project.id, flow.flowId);
    expect(revoke).toHaveBeenCalledWith(executionGrant.grantId);
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

  it("attributes pre-provider and resolver failures without claiming a provider call", async () => {
    const preRevoke = vi.fn();
    const preResolver = vi.fn();
    const pre = createService({ resolver: preResolver, revoke: preRevoke });
    const preProject = await pre.createProject({ name: "Pre-provider failure" });
    const preFlow = await pre.createFlow({ projectId: preProject.id, flowId: "flow.pre-failure", name: "Blank" });
    const preGrant = await grant(pre, preProject.id, preFlow.flowId);
    const preDiagnostic = await rejectedGenerationDiagnostic(pre.generateFlowBootstrapAdaptation({
      projectId: preProject.id,
      flowId: preFlow.flowId,
      executionGrant: preGrant
    }));
    expect(preDiagnostic).toEqual({
      code: "flow_bootstrap.active_instructions_required",
      stage: "pre_provider_validation",
      retryable: false,
      providerInvocation: "not_attempted",
      providerResponse: "not_received"
    });
    expect(preResolver).not.toHaveBeenCalled();
    expect(preRevoke).toHaveBeenCalledTimes(1);
    expect(preRevoke).toHaveBeenCalledWith(preGrant.grantId);

    const resolutionRevoke = vi.fn();
    const resolution = createService({
      resolver: vi.fn().mockRejectedValue(new Error("raw resolver failure")),
      revoke: resolutionRevoke
    });
    const resolvedFixture = await blankFixture(resolution);
    const resolutionGrant = await grant(resolution, resolvedFixture.project.id, resolvedFixture.flow.flowId);
    const resolutionDiagnostic = await rejectedGenerationDiagnostic(resolution.generateFlowBootstrapAdaptation({
      projectId: resolvedFixture.project.id,
      flowId: resolvedFixture.flow.flowId,
      executionGrant: resolutionGrant
    }));
    expect(resolutionDiagnostic).toEqual({
      code: "flow_bootstrap.provider_resolution_failed",
      stage: "provider_resolution",
      retryable: false,
      providerInvocation: "not_attempted",
      providerResponse: "not_received"
    });
    expect(JSON.stringify(resolutionDiagnostic)).not.toContain("raw resolver");
    expect(resolutionRevoke).toHaveBeenCalledTimes(1);
    expect(resolutionRevoke).toHaveBeenCalledWith(resolutionGrant.grantId);
  });

  it("attributes an unexpected harness throw conservatively without fabricated accounting", async () => {
    const revoke = vi.fn();
    const instance = createService({ revoke });
    const { project, flow } = await blankFixture(instance);
    const executionGrant = await grant(instance, project.id, flow.flowId);
    (instance as any).runFlowBootstrapLlmHarness = vi.fn().mockRejectedValue(new Error("raw harness failure"));

    const diagnostic = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      executionGrant
    }));

    expect(diagnostic).toEqual({
      code: "flow_bootstrap.provider_request_failed",
      stage: "provider_request",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "unknown"
    });
    expect(JSON.stringify(diagnostic)).not.toContain("raw harness");
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith(executionGrant.grantId);
    await expectNoTopology(instance, project.id, flow.flowId);
  });

  it("attributes invalid successful output with received-provider accounting", async () => {
    const revoke = vi.fn();
    const instance = createService({ revoke });
    const { project, flow } = await blankFixture(instance);
    const executionGrant = await grant(instance, project.id, flow.flowId);
    (instance as any).runFlowBootstrapLlmHarness = vi.fn().mockResolvedValue(
      successfulHarnessResult({ ...plan(), subflows: [] })
    );

    const diagnostic = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      executionGrant
    }));

    expect(diagnostic).toEqual({
      code: "flow_bootstrap.provider_output_validation_failed",
      stage: "provider_output_validation",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "received",
      accounting: {
        requestId: "request.phase",
        estimatedInputTokens: 321,
        provider: "mock-production",
        model: "mock-bootstrap",
        inputTokens: 120,
        outputTokens: 80,
        totalTokens: 200,
        estimatedCostUsd: 0.002
      }
    });
    expect(revoke).toHaveBeenCalledTimes(1);
    await expect((instance as any).listFlowBootstrapAdaptations(project.id, flow.flowId)).resolves.toEqual([]);
    await expectNoTopology(instance, project.id, flow.flowId);
  });

  it("attributes stale post-provider binding with received-provider accounting", async () => {
    const revoke = vi.fn();
    const instance = createService({ revoke });
    const { project, flow } = await blankFixture(instance);
    const executionGrant = await grant(instance, project.id, flow.flowId);
    (instance as any).runFlowBootstrapLlmHarness = vi.fn().mockResolvedValue(successfulHarnessResult());
    const getBinding = instance.getLlmExecutionBinding.bind(instance);
    let bindingReads = 0;
    vi.spyOn(instance, "getLlmExecutionBinding").mockImplementation(async (projectId, flowId) => {
      const binding = await getBinding(projectId, flowId);
      bindingReads += 1;
      return bindingReads === 2 ? { ...binding, settingsRevision: binding.settingsRevision + 1 } : binding;
    });

    const diagnostic = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      executionGrant
    }));

    expect(diagnostic).toMatchObject({
      code: "flow_bootstrap.post_provider_validation_failed",
      stage: "post_provider_validation",
      providerInvocation: "attempted",
      providerResponse: "received",
      accounting: { requestId: "request.phase", estimatedInputTokens: 321, totalTokens: 200 }
    });
    expect(revoke).toHaveBeenCalledTimes(1);
    await expect((instance as any).listFlowBootstrapAdaptations(project.id, flow.flowId)).resolves.toEqual([]);
  });

  it("attributes proposal persistence failure with received-provider accounting", async () => {
    const revoke = vi.fn();
    const instance = createService({ revoke });
    const { project, flow } = await blankFixture(instance);
    const executionGrant = await grant(instance, project.id, flow.flowId);
    (instance as any).runFlowBootstrapLlmHarness = vi.fn().mockResolvedValue(successfulHarnessResult());
    vi.spyOn(instance, "createFlowBootstrapAdaptation").mockRejectedValue(new Error("raw persistence failure"));

    const diagnostic = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      executionGrant
    }));

    expect(diagnostic).toMatchObject({
      code: "flow_bootstrap.persistence_failed",
      stage: "persistence",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "received",
      accounting: { requestId: "request.phase", estimatedInputTokens: 321, totalTokens: 200 }
    });
    expect(JSON.stringify(diagnostic)).not.toContain("raw persistence");
    expect(revoke).toHaveBeenCalledTimes(1);
    await expect((instance as any).listFlowBootstrapAdaptations(project.id, flow.flowId)).resolves.toEqual([]);
  });

  it("distinguishes unavailable, failed, and malformed provider resolution", async () => {
    const cases = [
      ["flow_bootstrap.provider_resolver_unavailable", (instance: AutomationStudioService) => { (instance as any).llmProviderResolver = undefined; }],
      ["flow_bootstrap.provider_resolution_failed", (instance: AutomationStudioService) => { (instance as any).llmProviderResolver = vi.fn().mockRejectedValue(new Error("raw resolver failure")); }],
      ["flow_bootstrap.provider_resolution_invalid", (instance: AutomationStudioService) => { (instance as any).llmProviderResolver = vi.fn().mockResolvedValue({}); }]
    ] as const;
    for (const [code, configure] of cases) {
      const revoke = vi.fn();
      const instance = createService({ revoke });
      const { project, flow } = await blankFixture(instance);
      const executionGrant = await grant(instance, project.id, flow.flowId);
      configure(instance);
      const diagnostic = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation({
        projectId: project.id,
        flowId: flow.flowId,
        executionGrant
      }));
      expect(diagnostic).toEqual({
        code,
        stage: "provider_resolution",
        retryable: false,
        providerInvocation: "not_attempted",
        providerResponse: "not_received"
      });
      expect(revoke).toHaveBeenCalledTimes(1);
    }
  });

  it("reports unavailable canonical settings binding before provider resolution", async () => {
    const resolver = vi.fn();
    const revoke = vi.fn();
    const instance = createService({ resolver, revoke });
    const { project, flow } = await blankFixture(instance);
    const executionGrant = await grant(instance, project.id, flow.flowId);
    vi.spyOn(instance, "getLlmExecutionBinding").mockRejectedValue(new Error("raw binding failure"));

    const diagnostic = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      executionGrant
    }));

    expect(diagnostic).toEqual({
      code: "flow_bootstrap.canonical_settings_binding_unavailable",
      stage: "pre_provider_validation",
      retryable: false,
      providerInvocation: "not_attempted",
      providerResponse: "not_received"
    });
    expect(resolver).not.toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it("projects the bound native runtime grants into bootstrap catalog selection without weakening permission filtering", async () => {
    const requests: AutomationStudioLlmTaskRequest[] = [];
    const providerRun = vi.fn(async (request: AutomationStudioLlmTaskRequest) => {
      requests.push(request);
      return {
        response: { kind: "flow_bootstrap", summary: "Build the active instruction.", plan: plan() },
        usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200, estimatedCostUsd: 0.002 }
      };
    });
    const granted = createService({ provider: mockProvider(providerRun) })
      .bindNativeNodeRuntime(permissionScopedNativeRuntime(["example.action"]));
    const grantedFixture = await blankFixture(granted, "active", "example");
    const grantedInstruction = await granted.getFlowInstruction(grantedFixture.project.id, "instruction.build");
    await granted.saveFlowInstruction(grantedFixture.project.id, {
      ...grantedInstruction!,
      body: "Click the required button.",
      updatedAt: Date.now()
    });

    await expect(granted.generateFlowBootstrapAdaptation({
      projectId: grantedFixture.project.id,
      flowId: grantedFixture.flow.flowId,
      executionGrant: await grant(granted, grantedFixture.project.id, grantedFixture.flow.flowId)
    })).resolves.toMatchObject({ status: "proposed" });

    expect(providerRun).toHaveBeenCalledTimes(1);
    expect(requests[0]?.context.flowBootstrap).toMatchObject({
      catalogSelection: { missingRequiredTerms: [] }
    });
    expect(requests[0]?.context.flowBootstrap?.nodeCatalog).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "domain.example.click" })])
    );

    const deniedProviderRun = vi.fn();
    const deniedResolver = vi.fn().mockReturnValue({ provider: mockProvider(deniedProviderRun) });
    const denied = createService({ resolver: deniedResolver })
      .bindNativeNodeRuntime(permissionScopedNativeRuntime([]));
    const deniedFixture = await blankFixture(denied, "active", "example");
    const deniedInstruction = await denied.getFlowInstruction(deniedFixture.project.id, "instruction.build");
    await denied.saveFlowInstruction(deniedFixture.project.id, {
      ...deniedInstruction!,
      body: "Click the required button.",
      updatedAt: Date.now()
    });

    const diagnostic = await rejectedGenerationDiagnostic(denied.generateFlowBootstrapAdaptation({
      projectId: deniedFixture.project.id,
      flowId: deniedFixture.flow.flowId,
      executionGrant: await grant(denied, deniedFixture.project.id, deniedFixture.flow.flowId)
    }));
    expect(diagnostic).toEqual({
      code: "flow_bootstrap.required_capabilities_unavailable",
      stage: "pre_provider_validation",
      retryable: false,
      providerInvocation: "not_attempted",
      providerResponse: "not_received"
    });
    expect(deniedResolver).not.toHaveBeenCalled();
    expect(deniedProviderRun).not.toHaveBeenCalled();
  });
  it("reports required instruction capabilities that the bounded catalog cannot supply", async () => {
    const resolver = vi.fn();
    const revoke = vi.fn();
    const instance = createService({ resolver, revoke });
    const { project, flow } = await blankFixture(instance);
    const instruction = await instance.getFlowInstruction(project.id, "instruction.build");
    await instance.saveFlowInstruction(project.id, {
      ...instruction!,
      body: "Click the required browser button using a web interaction node.",
      updatedAt: Date.now()
    });
    const executionGrant = await grant(instance, project.id, flow.flowId);

    const diagnostic = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      executionGrant
    }));

    expect(diagnostic).toEqual({
      code: "flow_bootstrap.required_capabilities_unavailable",
      stage: "pre_provider_validation",
      retryable: false,
      providerInvocation: "not_attempted",
      providerResponse: "not_received"
    });
    expect(resolver).not.toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it("keeps generation-lock infrastructure failures on the generic pre-provider fallback", async () => {
    const resolver = vi.fn();
    const revoke = vi.fn();
    const instance = createService({ resolver, revoke });
    const { project, flow } = await blankFixture(instance);
    const executionGrant = await grant(instance, project.id, flow.flowId);
    (instance as any).withBootstrapGenerationLock = vi.fn().mockRejectedValue(new Error("raw lock failure"));

    const diagnostic = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      executionGrant
    }));

    expect(diagnostic).toEqual({
      code: "flow_bootstrap.pre_provider_validation_failed",
      stage: "pre_provider_validation",
      retryable: false,
      providerInvocation: "not_attempted",
      providerResponse: "not_received"
    });
    expect(JSON.stringify(diagnostic)).not.toContain("raw lock");
    expect(resolver).not.toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledTimes(1);
  });
});
