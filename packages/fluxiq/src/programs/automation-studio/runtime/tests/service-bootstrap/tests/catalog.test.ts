import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import type { AutomationStudioLlmProviderResolverInput, AutomationStudioServiceOptions } from "../../../service.ts";
import { AutomationStudioService } from "../../../service.ts";
import { plan, mockProvider, permissionScopedNativeRuntime, blankFixture, caller, copyDataDirSeed, rejectedGenerationDiagnostic, seedDataDir, blankFixturesPerService, type DataDirSeed } from "./fixtures.ts";

// Every case needs a project holding a blank Flow and its active instruction. Writing it through the service costs about a second on an idle
// machine and several under load, inside each case's 15s budget, so it is written once
// per file from a closed service and each case runs on its own copy.
const SEEDING_TIMEOUT_MS = 60_000;

type Fixture = Awaited<ReturnType<typeof blankFixture>>;

let tempRoot: string;
let seedRoot: string;
/** One blank project with no domain. */
let single: DataDirSeed<Fixture>;
/** Two blank `example`-domain projects in one data directory: one for the granted runtime, one for the denied. */
let examplePair: DataDirSeed<[Fixture, Fixture]>;

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
  beforeAll(async () => {
    seedRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-flow-bootstrap-catalog-seed-"));
    single = await seedDataDir(path.join(seedRoot, "single"), (instance) => blankFixture(instance));
    const pairDir = path.join(seedRoot, "example-pair");
    examplePair = await seedDataDir(pairDir, async (instance) => await blankFixturesPerService(pairDir, instance, 2, "active", "example") as [Fixture, Fixture]);
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

  it("reports unavailable canonical settings binding before provider resolution", async () => {
    const resolver = vi.fn();
    const { project, flow } = await seeded(single);
    const instance = createService({ resolver });
    vi.spyOn(instance, "getLlmExecutionBinding").mockRejectedValue(new Error("raw binding failure"));

    const diagnostic = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      caller: caller()
    }));

    expect(diagnostic).toEqual({
      code: "flow_bootstrap.canonical_settings_binding_unavailable",
      stage: "pre_provider_validation",
      retryable: false,
      providerInvocation: "not_attempted",
      providerResponse: "not_received"
    });
    expect(resolver).not.toHaveBeenCalled();
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
    const [grantedFixture, deniedFixture] = await seeded(examplePair);
    const granted = createService({ provider: mockProvider(providerRun) })
      .bindNativeNodeRuntime(permissionScopedNativeRuntime(["example.action"]));
    const grantedInstruction = await granted.getFlowInstruction(grantedFixture.project.id, "instruction.build");
    await granted.saveFlowInstruction(grantedFixture.project.id, {
      ...grantedInstruction!,
      body: "Click the required button.",
      updatedAt: Date.now()
    });

    await expect(granted.generateFlowBootstrapAdaptation({
      projectId: grantedFixture.project.id,
      flowId: grantedFixture.flow.flowId,
      caller: caller()
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
    const deniedInstruction = await denied.getFlowInstruction(deniedFixture.project.id, "instruction.build");
    await denied.saveFlowInstruction(deniedFixture.project.id, {
      ...deniedInstruction!,
      body: "Click the required button.",
      updatedAt: Date.now()
    });

    const diagnostic = await rejectedGenerationDiagnostic(denied.generateFlowBootstrapAdaptation({
      projectId: deniedFixture.project.id,
      flowId: deniedFixture.flow.flowId,
      caller: caller()
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
    const { project, flow } = await seeded(single);
    const instance = createService({ resolver });
    const instruction = await instance.getFlowInstruction(project.id, "instruction.build");
    await instance.saveFlowInstruction(project.id, {
      ...instruction!,
      body: "Click the required browser button using a web interaction node.",
      updatedAt: Date.now()
    });

    const diagnostic = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      caller: caller()
    }));

    expect(diagnostic).toEqual({
      code: "flow_bootstrap.required_capabilities_unavailable",
      stage: "pre_provider_validation",
      retryable: false,
      providerInvocation: "not_attempted",
      providerResponse: "not_received"
    });
    expect(resolver).not.toHaveBeenCalled();
  });
});
