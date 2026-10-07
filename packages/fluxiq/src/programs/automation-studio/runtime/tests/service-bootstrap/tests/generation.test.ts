import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult, AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest } from "../../../llm/index.ts";
import type { AutomationStudioLlmProviderResolverInput, AutomationStudioServiceOptions } from "../../../service.ts";
import { AutomationStudioService } from "../../../service.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_OUTPUT_SCHEMA } from "../../../flow-bootstrap/index.ts";
import { estimateAutomationStudioDeepSeekInputTokens } from "../../../llm/index.ts";
import { AutomationStudioAesGcmProjectContentProtection } from "../../../../storage/index.ts";
import { automationStudioReplayingBinding } from "../../replaying-binding.ts";
import { plan, mockProvider, blankFixture, caller, expectNoTopology, rejectedGenerationDiagnostic, copyDataDirSeed, seedDataDir, isJudgeRequest, judgeReply, JUDGE_USAGE, type DataDirSeed } from "./fixtures.ts";

let tempRoot: string;
type Fixture = Awaited<ReturnType<typeof blankFixture>>;

// Every case needs a blank project. Writing one through the service costs about a
// second on an idle machine and several under load, inside each case's 15 s budget,
// so it is written once per file by a closed service and each case runs on its own copy.
const SEEDING_TIMEOUT_MS = 60_000;
let seedRoot: string;
/** One blank project with no domain. */
let single: DataDirSeed<Fixture>;
/** One blank `domain.test`-domain project. */
let domainTest: DataDirSeed<Fixture>;

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

/**
 * A build finishes only once a run of the whole Flow from its start was judged
 * a success (user, 2026-10-02), so a build these cases finish has to add a step
 * the Flow keeps. This is the stand-in's answer for a call the model adds: a
 * read the Flow keeps (`proposes`), as an execution result the build's test can
 * run again once the domain is wrapped in `automationStudioReplayingBinding`.
 */
function keptRead(evidence: JsonObject): AutomationStudioLlmEvidenceToolExecutionResult {
  return { kind: "llm_evidence_tool_execution", evidence, effectApplied: true, draft: { proposes: true } };
}

/** The model's decision that reads one area and adds the read to the Flow. */
const addRead = (callId: string, area: string) => ({ kind: "tool_call", callId, toolId: "inspect", input: { area, keep: true }, add: true });

describe("AutomationStudioService generateFlowBootstrapAdaptation", () => {
  beforeAll(async () => {
    seedRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-flow-bootstrap-seed-"));
    single = await seedDataDir(path.join(seedRoot, "single"), (instance) => blankFixture(instance));
    domainTest = await seedDataDir(path.join(seedRoot, "domainTest"), (instance) => blankFixture(instance, "active", "domain.test"));
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

  it("does not mark a missing or control-only native registry as bootstrap-ready", () => {
    const instance = createService();
    expect(instance.getFlowBootstrapGenerationRuntimeReadiness()).toEqual({
      providerResolverConfigured: true,
      nativeNodeRegistryConfigured: false,
      llmEvidenceRuntime: { bound: false, toolCount: 0 },
      candidateTrial: { runner: true, startReset: false }
    });
    (instance as any).nativeNodeRuntime = new AutomationStudioNativeNodeRuntime();
    expect(instance.getFlowBootstrapGenerationRuntimeReadiness()).toEqual({
      providerResolverConfigured: true,
      nativeNodeRegistryConfigured: false,
      llmEvidenceRuntime: { bound: false, toolCount: 0 },
      candidateTrial: { runner: true, startReset: false }
    });
  });

  it("saves and updates one bounded evidence-guided instruction before binding", async () => {
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

  // A build's model call needs no grant: the caller names whose key pays, and
  // nothing is issued, checked or revoked around the call.
  it("builds with no grant: resolves the bounded provider for the caller and persists one sanitized pending proposal without topology mutation", async () => {
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
      tokenLimits: { maxInputTokens: 992_000, maxOutputTokens: 8_000, maxTotalTokens: 1_000_000 },
      maxCallsPerRun: 1,
      maxEstimatedCostUsd: 0.1,
      timeoutMs: 20_000
    });
    const { project, flow } = await seeded(single);
    const instance = createService({ provider, resolver });
    const binding = await instance.getLlmExecutionBinding(project.id, flow.flowId);

    const result = await instance.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      caller: caller()
    });

    // The resolver is told only who the call is for.
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(resolver).toHaveBeenCalledWith({ projectId: project.id, flowId: flow.flowId, caller: caller() });
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
      baseDependencyDigest: binding.executionDigest,
      baseSettingsRevision: binding.settingsRevision,
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
      .resolves.toMatchObject({ status: "proposed", baseSettingsRevision: binding.settingsRevision });
    await expectNoTopology(instance, project.id, flow.flowId);
  });

  it("runs a bounded evidence loop and persists only content-free trace with the bootstrap adaptation", async () => {
    const requests: AutomationStudioLlmTaskRequest[] = [];
    const provider = mockProvider(async (request) => {
      requests.push(request);
      if (isJudgeRequest(request)) return judgeReply();
      // One read the Flow keeps, then the Flow is ready.
      const decision = requests.length === 1 ? addRead("call.read", "list") : { kind: "complete", result: { summary: "Evidence-guided Flow.", plan: plan() } };
      return {
        response: { kind: "evidence_tool_decision", summary: "Build candidate.", decision },
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 }
      };
    });
    // The free look answers raw; the read the model adds answers as a step the Flow keeps. Both carry content the trace must not.
    const executeTool = vi.fn(async (input: { value: JsonObject }) => input.value.keep ? keptRead({ privatePageContent: "not persisted", factCount: 1 }) : { privatePageContent: "not persisted", factCount: 1 });
    const { project, flow } = await seeded(single);
    const instance = createService({
      provider,
      resolver: () => ({ provider, maxCallsPerRun: 4 }), // Four, so its first decision is before the last three, which offer no tools (`llm/loop-budget.ts`).
      evidenceRuntime: automationStudioReplayingBinding({ domainId: "test.domain", deniedEvidenceKeys: [], tools: [{ toolId: "inspect", description: "Inspect bounded domain evidence.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: { scope: "current" } } }], executeTool })
    });
    const result = await instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, caller: caller(), evidenceGuided: true });

    // Two decisions -- the read, and the Flow is ready -- then the judge of the Flow's test, through the same provider:
    // its yes, and the second call that confirms it (murwcmx2, C-H).
    expect(requests.map((request) => request.taskKind)).toEqual(["evidence_tool_decision", "evidence_tool_decision", "loop_verification", "loop_verification"]);
    // Within the model's window, the only bound on a request since 2026-09-30; it was 8,000 tokens.
    expect(requests.every((request) => estimateAutomationStudioDeepSeekInputTokens(request) <= 992_000)).toBe(true);
    expect(requests[0]?.context.flowBootstrap?.nodeCatalog.length).toBeGreaterThan(0);
    expect(requests[0]?.context).not.toHaveProperty("reusableContext");
    expect(executeTool).toHaveBeenCalledWith(expect.objectContaining({ projectId: project.id, flowId: flow.flowId, callId: "initial.inspect", toolId: "inspect", value: { scope: "current" } }));
    // The first observation is not sized: the model is shown the whole page.
    expect(executeTool.mock.calls[0]?.[0]).not.toHaveProperty("maxEvidenceBytes");
    // The build pays for its judge: the decisions' spend and both judge calls', together.
    expect(result.accounting).toMatchObject({ inputTokens: 2 * 10 + 2 * JUDGE_USAGE.inputTokens, outputTokens: 2 * 5 + 2 * JUDGE_USAGE.outputTokens, totalTokens: 2 * 15 + 2 * JUDGE_USAGE.totalTokens });
    expect(result.accounting.estimatedCostUsd).toBeCloseTo(2 * 0.001 + 2 * JUDGE_USAGE.estimatedCostUsd, 9);
    const stored = await instance.getFlowBootstrapAdaptation(project.id, flow.flowId, result.adaptationId);
    expect(stored?.evidenceTrace).toMatchObject([{ iteration: 0, decision: "tool_call", toolId: "inspect" }, { iteration: 1, decision: "tool_call", toolId: "inspect" }, { iteration: 2, decision: "complete" }]);
    expect(stored?.auditEvents[0]?.detail).toMatchObject({
      evidenceGuided: true,
      iterationCount: 3,
      traceStepCount: 3,
      providerCallCount: 2,
      decisionCount: 2,
      // The judge's calls -- its yes and the call that confirms it (murwcmx2,
      // C-H) -- are calls outside the loop, counted where the accounting already
      // has their spend (t195-w28b).
      additionalProviderCallCount: 2,
      totalProviderCallCount: 4,
      toolCallCount: 2,
      toolIds: ["inspect"]
    });
    expect(JSON.stringify(stored?.evidenceTrace)).not.toContain("privatePageContent");
  });

  // The loop used to stop at `min(calls, 8)` decisions. The resolution's call
  // count is now what bounds it, and a model that never finishes is still
  // stopped at that count.
  it.each([
    { looks: 10, calls: 11, finishes: true },
    // Never finishing: stopped at the resolution's twelve, not at eight and not later.
    { looks: 100, calls: 12, finishes: false }
  ])("lets an evidence-guided bootstrap keep gathering past eight decisions, up to its call count (%o)", async ({ looks, calls, finishes }) => {
    const requests: AutomationStudioLlmTaskRequest[] = [];
    const provider = mockProvider(async (request) => {
      requests.push(request);
      if (isJudgeRequest(request)) return judgeReply();
      const iteration = request.context.evidenceLoop?.iteration ?? 0;
      // The first look is a read the Flow keeps, so a build that finishes has a Flow its test can run whole; it comes
      // first because a build's last three decisions offer no tools (`llm/loop-budget.ts`).
      const decision = iteration > looks
        ? { kind: "complete", result: { summary: "Evidence-guided Flow.", plan: plan() } }
        : iteration === 1
          ? addRead(`call.${iteration}`, `area.${iteration}`)
          : { kind: "tool_call", callId: `call.${iteration}`, toolId: "inspect", input: { area: `area.${iteration}` } };
      return { response: { kind: "evidence_tool_decision", summary: "Looking.", decision }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 } };
    });
    const { project, flow } = await seeded(single);
    const instance = createService({
      provider,
      resolver: () => ({ provider, maxCallsPerRun: 12, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 2 }),
      evidenceRuntime: automationStudioReplayingBinding({
        domainId: "test.domain",
        deniedEvidenceKeys: [],
        tools: [{ toolId: "inspect", description: "Inspect one area.", inputSchema: { type: "object" }, effect: "observe" }],
        executeTool: async (input: { value: JsonObject }) => input.value.keep ? keptRead({ area: String(input.value.area) }) : ({ area: String(input.value.area) })
      })
    });
    const generation = instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, caller: caller(), evidenceGuided: true });

    if (finishes) {
      const result = await generation;
      await expect(instance.getFlowBootstrapAdaptation(project.id, flow.flowId, result.adaptationId)).resolves.toMatchObject({ status: "proposed" });
    } else {
      await expect(generation).rejects.toThrow();
    }
    // A build that finishes then asks the judge of its test twice, its yes confirmed by a second call (murwcmx2, C-H):
    // provider calls that are not decisions.
    const decisions = requests.filter((request) => !isJudgeRequest(request));
    expect(decisions).toHaveLength(calls);
    expect(requests).toHaveLength(calls + (finishes ? 2 : 0));
    // A new Flow's settings carry the run cost ceiling ($0.10 since 2026-10-01;
    // was $0.25), and the build's
    // total is that ceiling, which the resolution's $2 cannot raise. A build has
    // no ledger, so its requests no longer carry an even share of the total
    // that nothing checked: each carries the harness's own per-request default.
    const configured = (await instance.getFlow(project.id, flow.flowId)).metadata?.adaptationPolicySettings as { maxEstimatedCostUsdPerRun?: number } | undefined;
    expect(configured?.maxEstimatedCostUsdPerRun).toBe(0.25);
    for (const request of decisions) expect(request.maxEstimatedCostUsd).toBe(0.25);
    // The judge's calls are held against the build's one purse (`llm/build-purse/`, t234), as the decisions are,
    // so they carry no share of their own: no longer half of what the build has left, the per-request default instead.
    const judged = requests.filter(isJudgeRequest);
    if (finishes) expect(judged[0]?.maxEstimatedCostUsd).toBe(decisions[0]?.maxEstimatedCostUsd);
  });

  it("packs opted-in reusable context only after a fresh creation inspection and records safe provenance", async () => {
    const requests: AutomationStudioLlmTaskRequest[] = [];
    const selectedEvidence: unknown[] = [];
    const provider = mockProvider(async (request) => {
      if (isJudgeRequest(request)) return judgeReply();
      requests.push(request);
      // One read the Flow keeps, then the Flow is ready.
      const decision = requests.length === 1 ? addRead("call.read", "buttons") : { kind: "complete", result: { summary: "Evidence-guided Flow.", plan: plan() } };
      return { response: { kind: "evidence_tool_decision", summary: "Build candidate.", decision } };
    });
    const contentProtection = new AutomationStudioAesGcmProjectContentProtection(() => ({ keyId: "test.key", key: Buffer.alloc(32, 6) }));
    const { project, flow } = await seeded(domainTest);
    const instance = createService({
      provider,
      resolver: () => ({ provider, maxCallsPerRun: 4 }), // Four, so its first decision may still add a step.
      evidenceRuntime: automationStudioReplayingBinding({ domainId: "domain.test", deniedEvidenceKeys: [], tools: [{ toolId: "inspect", description: "Inspect bounded domain evidence.", inputSchema: { type: "object" }, effect: "observe", initialObservation: { input: {} } }], executeTool: async (input: { value: JsonObject }) => input.value.keep ? keptRead({ schemaVersion: "evidence.v1", facts: [{ role: "button" }] }) : ({ schemaVersion: "evidence.v1", facts: [{ role: "button" }] }) }), // Same domain as the project below: a runtime bound for one domain offers a Flow in another nothing.
      reusableLlmContext: {
        enabled: true,
        contentProtection,
        selectForFreshEvidence: (input) => {
          selectedEvidence.push(input.freshEvidence);
          return { domainId: "domain.test", evidenceKind: "exploration", evidenceSchemaVersion: "evidence.v1", sanitizerVersion: "sanitizer.v1", compatibilityTags: [{ name: "surface", value: "same" }] };
        }
      }
    });
    await instance.putReusableLlmContext({ projectId: project.id, actorId: "fixture", record: {
      recordId: "context.creation", flowId: flow.flowId, domainId: "domain.test", evidenceKind: "exploration", evidenceSchemaVersion: "evidence.v1", sanitizerVersion: "sanitizer.v1",
      compatibilityTags: [{ name: "surface", value: "same" }], promptProjection: { facts: [{ kind: "element", role: "button" }] }, outcome: "succeeded", reviewerState: "approved",
      sourceRunIds: ["run.prior"], sourceAdaptationIds: ["adaptation.prior"]
    } });
    const result = await instance.generateFlowBootstrapAdaptation({ projectId: project.id, flowId: flow.flowId, caller: caller(), evidenceGuided: true, useReusableContext: true });
    // Selected before each decision, from what the domain had observed by then: the first, before anything else, from the
    // fresh creation inspection alone.
    expect(selectedEvidence).toHaveLength(requests.length);
    expect(selectedEvidence[0]).toEqual([{ schemaVersion: "evidence.v1", facts: [{ role: "button" }] }]);
    // The fresh inspection is the only evidence observed before the first
    // decision; the loop's own `core.budget` entry, where a small build carries
    // one (`llm/loop-budget.ts`), is Core's.
    // The draft entry is Core's too: it carries the acts checklist from the first decision.
    const observed = (requests[0]?.context.evidenceLoop?.evidence ?? []).filter((entry) => entry.toolId !== "core.budget" && entry.toolId !== "core.flow_draft");
    expect(observed).toEqual([expect.objectContaining({ callId: "initial.inspect", toolId: "inspect" })]);
    expect(requests[0]?.context.reusableContext).toMatchObject({ items: [{ advisory: true, recordId: "context.creation", sourceRunIds: ["run.prior"], sourceAdaptationIds: ["adaptation.prior"] }] });
    const stored = await instance.getFlowBootstrapAdaptation(project.id, flow.flowId, result.adaptationId);
    // What is recorded is the last selection's: the inspection and the read the Flow kept, both fresh.
    expect(stored?.reusableContext).toMatchObject({ status: "hit", freshContributionCount: 2, reusedContributionCount: 1, sourceRecordIds: ["context.creation"] });
    expect(stored?.auditEvents[0]?.detail).toMatchObject({ reusableContext: { status: "hit", sourceRunIds: ["run.prior"], sourceAdaptationIds: ["adaptation.prior"] } });
  });

  it("returns the closed evidence-loop reason and content-free counts", async () => {
    const provider = mockProvider(async () => ({
      response: { kind: "evidence_tool_decision", summary: "Use a tool.", decision: { kind: "tool_call", callId: "call.unknown", toolId: "unregistered", input: {} } },
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 }
    }));
    const { project, flow } = await seeded(single);
    const instance = createService({
      provider,
      resolver: () => ({ provider, maxCallsPerRun: 3 }),
      evidenceRuntime: { domainId: "test.domain", deniedEvidenceKeys: [], tools: [{ toolId: "inspect", description: "Inspect bounded evidence.", inputSchema: { type: "object" } }], executeTool: vi.fn() }
    });
    const diagnostic = await rejectedGenerationDiagnostic(instance.generateFlowBootstrapAdaptation({
      projectId: project.id,
      flowId: flow.flowId,
      caller: caller(),
      evidenceGuided: true
    }));
    expect(diagnostic).toEqual({
      code: "flow_bootstrap.evidence_unknown_tool",
      stage: "provider_output_validation",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "received",
      // What the build spent before it ended, so a failed run can be costed.
      accounting: { requestId: expect.stringMatching(/^evidence\./), estimatedInputTokens: expect.any(Number), provider: "mock-production", model: "mock-bootstrap", inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 },
      evidenceLoop: { iterationCount: 1, decisionCount: 0, toolCallCount: 0, evidenceBytes: 0 },
      // Every logical question the build's purse settled (t262), apart from the
      // loop's own decision count: the one decision whose tool was unknown.
      totalProviderCallCount: 1
    });
  });
});
