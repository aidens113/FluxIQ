import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmProvider } from "../../../llm/index.ts";
import type { AutomationStudioLlmProviderResolverInput, AutomationStudioServiceOptions } from "../../../service.ts";
import { AutomationStudioService } from "../../../service.ts";
import { plan, mockProvider, blankFixture, grant, expectNoTopology, rejectedGenerationDiagnostic, successfulHarnessResult } from "./fixtures.ts";

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
    await expect((instance as any).bootstrapAdaptations.listFlowBootstrapAdaptations(project.id, flow.flowId)).resolves.toEqual([]);
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
    await expect((instance as any).bootstrapAdaptations.listFlowBootstrapAdaptations(project.id, flow.flowId)).resolves.toEqual([]);
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
    await expect((instance as any).bootstrapAdaptations.listFlowBootstrapAdaptations(project.id, flow.flowId)).resolves.toEqual([]);
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

  it("reports a generation-lock failure by its closed code, without the raw error and before any provider", async () => {
    const resolver = vi.fn();
    const revoke = vi.fn();
    const instance = createService({ resolver, revoke });
    const { project, flow } = await blankFixture(instance);
    const executionGrant = await grant(instance, project.id, flow.flowId);
    (instance as any).locks.withBootstrapGenerationLock = vi.fn().mockRejectedValue(new Error("raw lock failure"));

    const diagnostic = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      executionGrant
    }));

    expect(diagnostic).toEqual({
      code: "flow_bootstrap.generation_lock_failed",
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
