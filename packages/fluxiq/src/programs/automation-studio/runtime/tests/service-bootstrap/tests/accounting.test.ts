import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AutomationStudioFlowBootstrapGenerationError } from "../../../flow-bootstrap/index.ts";
import type { AutomationStudioLlmProvider } from "../../../llm/index.ts";
import type { AutomationStudioLlmProviderResolverInput, AutomationStudioServiceOptions } from "../../../service.ts";
import { AutomationStudioService } from "../../../service.ts";
import { plan, mockProvider, blankFixture, caller, expectNoTopology, rejectedGenerationDiagnostic, successfulHarnessResult } from "./fixtures.ts";

let tempRoot: string;

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
    tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 2_000, maxTotalTokens: 10_000 },
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
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-flow-bootstrap-generation-"));
  });

  afterEach(async () => {
    await Promise.all([...services].map((instance) => instance.close()));
    services.clear();
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("persists no proposal on provider or output validation failure", async () => {
    const provider = mockProvider(async () => ({
      response: {
        kind: "flow_bootstrap",
        summary: "Invalid",
        plan: { ...plan(), recordingId: "forbidden" } as unknown as JsonObject
      }
    }));
    const instance = createService({ provider });
    const { project, flow } = await blankFixture(instance);

    await expect(instance.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      caller: caller()
    })).rejects.toThrow(/generation failed/);
    await expectNoTopology(instance, project.id, flow.flowId);
  });

  it("attributes pre-provider and resolver failures without claiming a provider call", async () => {
    const preResolver = vi.fn();
    const pre = createService({ resolver: preResolver });
    const preProject = await pre.createProject({ name: "Pre-provider failure" });
    const preFlow = await pre.createFlow({ projectId: preProject.id, flowId: "flow.pre-failure", name: "Blank" });
    const preDiagnostic = await rejectedGenerationDiagnostic(pre.generateFlowBootstrapAdaptation({
      projectId: preProject.id,
      flowId: preFlow.flowId,
      caller: caller()
    }));
    expect(preDiagnostic).toEqual({
      code: "flow_bootstrap.active_instructions_required",
      stage: "pre_provider_validation",
      retryable: false,
      providerInvocation: "not_attempted",
      providerResponse: "not_received"
    });
    expect(preResolver).not.toHaveBeenCalled();

    const resolution = createService({
      resolver: vi.fn().mockRejectedValue(new Error("raw resolver failure"))
    });
    const resolvedFixture = await blankFixture(resolution);
    const resolutionDiagnostic = await rejectedGenerationDiagnostic(resolution.generateFlowBootstrapAdaptation({
      projectId: resolvedFixture.project.id,
      flowId: resolvedFixture.flow.flowId,
      caller: caller()
    }));
    expect(resolutionDiagnostic).toEqual({
      code: "flow_bootstrap.provider_resolution_failed",
      stage: "provider_resolution",
      retryable: false,
      providerInvocation: "not_attempted",
      providerResponse: "not_received",
      // The resolver's own throw, named by class and line and never by its message.
      issueCodes: ["thrown.Error", expect.stringMatching(/^thrown\.at:runtime\.tests\.service-bootstrap\.tests\.accounting\.test\.ts:\d+$/u)]
    });
    expect(JSON.stringify(resolutionDiagnostic)).not.toContain("raw resolver");
  });

  it("does not claim a provider request when post-resolution build setup throws", async () => {
    const resolver = vi.fn(() => ({
      provider: mockProvider(),
      tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 2_000, maxTotalTokens: 10_000 },
      maxCallsPerRun: 2,
      maxEstimatedCostUsd: 0.1,
      timeoutMs: 20_000
    }));
    let failSetup = false;
    const evidenceRuntime = {
      domainId: "example",
      deniedEvidenceKeys: [],
      tools: [],
      executeTool: async () => ({ observed: true })
    } as unknown as NonNullable<AutomationStudioServiceOptions["llmEvidenceRuntime"]>;
    Object.defineProperty(evidenceRuntime, "tools", {
      configurable: true,
      get: () => {
        if (failSetup) throw new Error("private setup detail");
        return [];
      }
    });
    const instance = createService({ resolver, evidenceRuntime });
    const { project, flow } = await blankFixture(instance);
    const harness = vi.spyOn(instance as any, "runFlowBootstrapLlmHarness");
    failSetup = true;

    const diagnostic = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      caller: caller(),
      evidenceGuided: true
    }));

    expect(diagnostic).toEqual({
      code: "flow_bootstrap.pre_provider_validation_failed",
      stage: "pre_provider_validation",
      retryable: false,
      providerInvocation: "not_attempted",
      providerResponse: "not_received",
      // What was thrown and where, never what it said (`generation-failure/thrown-issue-codes.ts`).
      issueCodes: ["thrown.Error", expect.stringMatching(/^thrown\.at:runtime\.tests\.service-bootstrap\.tests\.accounting\.test\.ts:\d+$/u)]
    });
    expect(JSON.stringify(diagnostic)).not.toContain("private setup detail");
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(harness).not.toHaveBeenCalled();
  });

  // Entering the top-level harness proves neither that the provider was invoked
  // nor that it was not: request packing precedes the lower call seam, while
  // response work follows it. A raw escape therefore records unknown provenance.
  it.each([
    ["an Error one of Core's own guards threw", () => new Error("raw harness failure"), false, "flow_bootstrap.unexpected_error"],
    ["a defect in Core", () => new TypeError("raw harness failure"), false, "flow_bootstrap.internal_error"],
    ["an abort or a deadline", () => new DOMException("raw harness failure", "AbortError"), false, "flow_bootstrap.aborted_or_timed_out"],
    ["an evidence-decision escape", () => new Error("raw harness failure"), true, "flow_bootstrap.unexpected_error"]
  ] as const)("records unknown invocation for %s at the unobserved harness boundary", async (_kind, thrown, evidenceGuided, code) => {
    const evidenceRuntime = {
      domainId: "test.domain",
      deniedEvidenceKeys: [],
      tools: [{ toolId: "inspect", description: "Inspect bounded evidence.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } }],
      executeTool: async () => ({ factCount: 1 })
    } as unknown as NonNullable<AutomationStudioServiceOptions["llmEvidenceRuntime"]>;
    const evidenceProvider = mockProvider();
    const instance = createService({
      ...(evidenceGuided ? {
        evidenceRuntime,
        provider: evidenceProvider,
        resolver: () => ({ provider: evidenceProvider, maxCallsPerRun: 3 })
      } : {})
    });
    const { project, flow } = await blankFixture(instance);
    const harness = vi.fn().mockRejectedValue(thrown());
    (instance as any).runFlowBootstrapLlmHarness = harness;

    const diagnostic = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      caller: caller(),
      ...(evidenceGuided ? { evidenceGuided: true } : {})
    }));

    expect(diagnostic).toEqual({
      code,
      stage: "provider_request",
      retryable: false,
      providerInvocation: "unknown",
      providerResponse: "unknown"
    });
    expect(JSON.stringify(diagnostic)).not.toContain("raw harness");
    expect(harness).toHaveBeenCalledTimes(1);
    await expectNoTopology(instance, project.id, flow.flowId);
  });

  it("preserves a structured harness failure across the scoped request boundary", async () => {
    const instance = createService();
    const { project, flow } = await blankFixture(instance);
    const expected = {
      code: "flow_bootstrap.provider_timeout" as const,
      stage: "provider_request" as const,
      retryable: true,
      providerInvocation: "unknown" as const,
      providerResponse: "not_received" as const,
      accounting: { requestId: "request.structured", estimatedInputTokens: 12 }
    };
    (instance as any).runFlowBootstrapLlmHarness = vi.fn().mockRejectedValue(
      new AutomationStudioFlowBootstrapGenerationError(expected)
    );

    const diagnostic = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      caller: caller()
    }));

    expect(diagnostic).toEqual(expected);
    await expectNoTopology(instance, project.id, flow.flowId);
  });

  it("attributes invalid successful output with received-provider accounting", async () => {
    const instance = createService();
    const { project, flow } = await blankFixture(instance);
    (instance as any).runFlowBootstrapLlmHarness = vi.fn().mockResolvedValue(
      successfulHarnessResult({ ...plan(), subflows: [] })
    );

    const diagnostic = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      caller: caller()
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
      },
      // Core's own refusal of the plan, thrown in the service and named by its line there.
      issueCodes: ["thrown.Error", expect.stringMatching(/^thrown\.at:runtime\.service\.ts:\d+$/u)]
    });
    await expect((instance as any).bootstrapAdaptations.listFlowBootstrapAdaptations(project.id, flow.flowId)).resolves.toEqual([]);
    await expectNoTopology(instance, project.id, flow.flowId);
  });

  it("attributes stale post-provider binding with received-provider accounting", async () => {
    const instance = createService();
    const { project, flow } = await blankFixture(instance);
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
      caller: caller()
    }));

    expect(diagnostic).toMatchObject({
      code: "flow_bootstrap.post_provider_validation_failed",
      stage: "post_provider_validation",
      providerInvocation: "attempted",
      providerResponse: "received",
      accounting: { requestId: "request.phase", estimatedInputTokens: 321, totalTokens: 200 }
    });
    await expect((instance as any).bootstrapAdaptations.listFlowBootstrapAdaptations(project.id, flow.flowId)).resolves.toEqual([]);
  });

  it("attributes proposal persistence failure with received-provider accounting", async () => {
    const instance = createService();
    const { project, flow } = await blankFixture(instance);
    (instance as any).runFlowBootstrapLlmHarness = vi.fn().mockResolvedValue(successfulHarnessResult());
    vi.spyOn(instance, "createFlowBootstrapAdaptation").mockRejectedValue(new Error("raw persistence failure"));

    const diagnostic = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      caller: caller()
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
    await expect((instance as any).bootstrapAdaptations.listFlowBootstrapAdaptations(project.id, flow.flowId)).resolves.toEqual([]);
  });

  it("distinguishes unavailable, failed, and malformed provider resolution", async () => {
    const cases = [
      ["flow_bootstrap.provider_resolver_unavailable", (instance: AutomationStudioService) => { (instance as any).llmProviderResolver = undefined; }, false],
      ["flow_bootstrap.provider_resolution_failed", (instance: AutomationStudioService) => { (instance as any).llmProviderResolver = vi.fn().mockRejectedValue(new Error("raw resolver failure")); }, true],
      ["flow_bootstrap.provider_resolution_invalid", (instance: AutomationStudioService) => { (instance as any).llmProviderResolver = vi.fn().mockResolvedValue({}); }, false]
    ] as const;
    for (const [code, configure, threwHere] of cases) {
      const instance = createService();
      const { project, flow } = await blankFixture(instance);
      configure(instance);
      const diagnostic = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation({
        projectId: project.id,
        flowId: flow.flowId,
        caller: caller()
      }));
      expect(diagnostic).toEqual({
        code,
        stage: "provider_resolution",
        retryable: false,
        providerInvocation: "not_attempted",
        providerResponse: "not_received",
        // Only the resolver that threw is named, by its throw's class and line.
        ...(threwHere ? { issueCodes: ["thrown.Error", expect.stringMatching(/^thrown\.at:runtime\.tests\.service-bootstrap\.tests\.accounting\.test\.ts:\d+$/u)] } : {})
      });
    }
  });

  it("reports a generation-lock failure by its closed code, without the raw error and before any provider", async () => {
    const resolver = vi.fn();
    const instance = createService({ resolver });
    const { project, flow } = await blankFixture(instance);
    (instance as any).locks.withBootstrapGenerationLock = vi.fn().mockRejectedValue(new Error("raw lock failure"));

    const diagnostic = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      caller: caller()
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
  });
});
