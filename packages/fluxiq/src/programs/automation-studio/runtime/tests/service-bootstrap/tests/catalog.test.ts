import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import type { AutomationStudioLlmProviderResolverInput, AutomationStudioServiceOptions } from "../../../service.ts";
import { AutomationStudioService } from "../../../service.ts";
import { plan, mockProvider, permissionScopedNativeRuntime, blankFixture, grant, rejectedGenerationDiagnostic } from "./fixtures.ts";

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
});
