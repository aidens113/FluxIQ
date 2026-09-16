import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import type { AutomationStudioLlmProviderResolverInput, AutomationStudioServiceOptions } from "../../../service.ts";
import { AutomationStudioService } from "../../../service.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA } from "../../../flow-bootstrap/index.ts";
import { estimateAutomationStudioDeepSeekInputTokens } from "../../../llm/index.ts";
import { AutomationStudioAesGcmProjectContentProtection } from "../../../../storage/index.ts";
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

  it("saves and updates one bounded evidence-guided instruction before grant binding", async () => {
    const instance = createService();
    const project = await instance.createProject({ name: "Evidence instruction" });
    const flow = await instance.createFlow({ projectId: project.id, flowId: "flow.evidence-instruction", name: "Blank" });
    const before = await instance.getLlmExecutionBinding(project.id, flow.flowId);
    const first = await instance.saveFlowGenerationInstruction({ projectId: project.id, flowId: flow.flowId, instruction: "Inspect available evidence and build the requested Flow." });
    const after = await instance.getLlmExecutionBinding(project.id, flow.flowId);
    const second = await instance.saveFlowGenerationInstruction({ projectId: project.id, flowId: flow.flowId, instruction: "Build the revised requested Flow." });
    expect(first).toMatchObject({ scope: { kind: "flow", projectId: project.id, flowId: flow.flowId }, status: "active", requirement: "required", tags: ["generation"], metadata: { source: "evidence_guided_generation" } });
    expect(after).not.toEqual(before);
    expect(second.instructionId).toBe(first.instructionId);
    expect(second.body).toBe("Build the revised requested Flow.");
    await expect(instance.saveFlowGenerationInstruction({ projectId: project.id, flowId: flow.flowId, instruction: " ".repeat(4_001) })).rejects.toThrow("1 to 4,000");
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
        flowBootstrap: { outputSchema: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA }
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

  it("runs a bounded evidence loop and persists only content-free trace with the bootstrap adaptation", async () => {
    const requests: AutomationStudioLlmTaskRequest[] = [];
    const provider = mockProvider(async (request) => {
      requests.push(request);
      return {
        response: { kind: "evidence_tool_decision", summary: "Build candidate.", decision: { kind: "complete", result: { summary: "Evidence-guided Flow.", plan: plan() } } },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 }
      };
    });
    const executeTool = vi.fn().mockResolvedValue({ privatePageContent: "not persisted", factCount: 1 });
    const instance = createService({
      provider,
      resolver: () => ({ provider, maxCallsPerRun: 3 }),
      evidenceRuntime: { domainId: "test.domain", deniedEvidenceKeys: [], tools: [{ toolId: "inspect", description: "Inspect bounded domain evidence.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: { scope: "current" } } }], executeTool }
    });
    const { project, flow } = await blankFixture(instance);
    const result = await instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, executionGrant: await grant(instance, project.id, flow.flowId), evidenceGuided: true });

    expect(requests.map((request) => request.taskKind)).toEqual(["evidence_tool_decision"]);
    expect(requests.every((request) => estimateAutomationStudioDeepSeekInputTokens(request) <= 8_000)).toBe(true);
    expect(requests[0]?.context.flowBootstrap?.nodeCatalog.length).toBeGreaterThan(0);
    expect(requests[0]?.context).not.toHaveProperty("reusableContext");
    expect(executeTool).toHaveBeenCalledWith(expect.objectContaining({ projectId: project.id, flowId: flow.flowId, callId: "initial.inspect", toolId: "inspect", value: { scope: "current" }, maxEvidenceBytes: 7_488 }));
    expect(result.accounting).toMatchObject({ inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 });
    const stored = await instance.getFlowBootstrapAdaptation(project.id, flow.flowId, result.adaptationId);
    expect(stored?.evidenceTrace).toMatchObject([{ iteration: 0, decision: "tool_call", toolId: "inspect" }, { iteration: 1, decision: "complete" }]);
    expect(stored?.auditEvents[0]?.detail).toMatchObject({
      evidenceGuided: true,
      iterationCount: 2,
      traceStepCount: 2,
      providerCallCount: 1,
      decisionCount: 1,
      toolCallCount: 1,
      toolIds: ["inspect"]
    });
    expect(JSON.stringify(stored?.evidenceTrace)).not.toContain("privatePageContent");
  });

  it("packs opted-in reusable context only after a fresh creation inspection and records safe provenance", async () => {
    const requests: AutomationStudioLlmTaskRequest[] = [];
    const selectedEvidence: unknown[] = [];
    const provider = mockProvider(async (request) => {
      requests.push(request);
      return { response: { kind: "evidence_tool_decision", summary: "Build candidate.", decision: { kind: "complete", result: { summary: "Evidence-guided Flow.", plan: plan() } } } };
    });
    const contentProtection = new AutomationStudioAesGcmProjectContentProtection(() => ({ keyId: "test.key", key: Buffer.alloc(32, 6) }));
    const instance = createService({
      provider,
      resolver: () => ({ provider, maxCallsPerRun: 3 }),
      evidenceRuntime: { domainId: "domain.test", deniedEvidenceKeys: [], tools: [{ toolId: "inspect", description: "Inspect bounded domain evidence.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } }], executeTool: async () => ({ schemaVersion: "evidence.v1", facts: [{ role: "button" }] }) }, // Same domain as the project below: a runtime bound for one domain offers a Flow in another nothing.
      reusableLlmContext: {
        enabled: true,
        contentProtection,
        selectForFreshEvidence: (input) => {
          selectedEvidence.push(input.freshEvidence);
          return { domainId: "domain.test", evidenceKind: "exploration", evidenceSchemaVersion: "evidence.v1", sanitizerVersion: "sanitizer.v1", compatibilityTags: [{ name: "surface", value: "same" }] };
        }
      }
    });
    const { project, flow } = await blankFixture(instance, "active", "domain.test");
    await instance.putReusableLlmContext({ projectId: project.id, actorId: "fixture", record: {
      recordId: "context.creation", flowId: flow.flowId, domainId: "domain.test", evidenceKind: "exploration", evidenceSchemaVersion: "evidence.v1", sanitizerVersion: "sanitizer.v1",
      compatibilityTags: [{ name: "surface", value: "same" }], promptProjection: { facts: [{ kind: "element", role: "button" }] }, outcome: "succeeded", reviewerState: "approved",
      sourceRunIds: ["run.prior"], sourceAdaptationIds: ["adaptation.prior"]
    } });
    const result = await instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, executionGrant: await grant(instance, project.id, flow.flowId), evidenceGuided: true, useReusableContext: true });
    expect(selectedEvidence).toHaveLength(1);
    expect(requests[0]?.context.evidenceLoop?.evidence).toHaveLength(1);
    expect(requests[0]?.context.reusableContext).toMatchObject({ items: [{ advisory: true, recordId: "context.creation", sourceRunIds: ["run.prior"], sourceAdaptationIds: ["adaptation.prior"] }] });
    const stored = await instance.getFlowBootstrapAdaptation(project.id, flow.flowId, result.adaptationId);
    expect(stored?.reusableContext).toMatchObject({ status: "hit", freshContributionCount: 1, reusedContributionCount: 1, sourceRecordIds: ["context.creation"] });
    expect(stored?.auditEvents[0]?.detail).toMatchObject({ reusableContext: { status: "hit", sourceRunIds: ["run.prior"], sourceAdaptationIds: ["adaptation.prior"] } });
  });

  it("returns the closed evidence-loop reason and content-free counts", async () => {
    const provider = mockProvider(async () => ({
      response: { kind: "evidence_tool_decision", summary: "Use a tool.", decision: { kind: "tool_call", callId: "call.unknown", toolId: "unregistered", input: {} } },
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 }
    }));
    const instance = createService({
      provider,
      resolver: () => ({ provider, maxCallsPerRun: 3 }),
      evidenceRuntime: { domainId: "test.domain", deniedEvidenceKeys: [], tools: [{ toolId: "inspect", description: "Inspect bounded evidence.", inputSchema: { type: "object" } }], executeTool: vi.fn() }
    });
    const { project, flow } = await blankFixture(instance);
    const diagnostic = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      executionGrant: await grant(instance, project.id, flow.flowId),
      evidenceGuided: true
    }));
    expect(diagnostic).toEqual({
      code: "flow_bootstrap.evidence_unknown_tool",
      stage: "provider_output_validation",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "received",
      evidenceLoop: { iterationCount: 1, decisionCount: 0, toolCallCount: 0, evidenceBytes: 0 }
    });
  });
});
