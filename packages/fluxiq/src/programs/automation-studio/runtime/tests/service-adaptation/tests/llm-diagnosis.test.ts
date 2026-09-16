import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioService } from "../../../service.ts";
import { AutomationStudioAesGcmProjectContentProtection } from "../../../../storage/index.ts";
import { createFailingCanonicalFlow, adaptiveTrainingMetadata } from "../../service-fixtures.ts";

let tempRoot: string;

const services = new Set<AutomationStudioService>();

function createService(...args: ConstructorParameters<typeof AutomationStudioService>): AutomationStudioService {
  const service = new AutomationStudioService(...args);
  services.add(service);
  return service;
}

describe("AutomationStudioService recording persistence", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-automation-studio-service-"));
  });

  afterEach(async () => {
    await Promise.all([...services].map((service) => service.close()));
    services.clear();
    await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  it("records a missing-provider runtime diagnosis intervention when adaptive policy allows LLM", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Missing provider" });
    const flow = await createFailingCanonicalFlow(service, project.id, { flowId: "flow.missing-provider", metadata: adaptiveTrainingMetadata() });

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, inputs: { numerator: 1, denominator: 0 } });
    const detail = await service.getFlowRunDetail(project.id, run.runId);
    const harnessIntervention = detail?.interventions.find((intervention) => intervention.promptVersion === "automation-studio.runtime-diagnosis.v1");

    expect(run.status).toBe("failed");
    expect(harnessIntervention).toMatchObject({
      kind: "diagnosis",
      validation: { ok: false, issues: [expect.stringContaining("llm.provider_missing")] }
    });
    expect(detail?.metadata).toMatchObject({
      llmGate: {
        invoked: false,
        providerConfigured: false,
        ok: false
      }
    });
  });

  it("runs a configured runtime diagnosis provider and rolls usage into run summary", async () => {
    const service = createService({
      dataDir: tempRoot,
      seedFixture: false,
      llmProviderResolver: () => ({
        metadata: { provider: "mock", model: "diagnosis-model" },
        runTask: async () => ({
          response: { kind: "diagnosis", summary: "Division failed because denominator is zero.", confidence: 0.9 },
          usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18, estimatedCostUsd: 0.002 }
        })
      })
    });
    const project = await service.createProject({ name: "Mock provider" });
    const flow = await createFailingCanonicalFlow(service, project.id, { flowId: "flow.mock-provider", metadata: adaptiveTrainingMetadata() });

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, inputs: { numerator: 1, denominator: 0 } });
    const detail = await service.getFlowRunDetail(project.id, run.runId);
    const harnessIntervention = detail?.interventions.find((intervention) => intervention.provider === "mock");

    expect(harnessIntervention).toMatchObject({
      provider: "mock",
      model: "diagnosis-model",
      tokenUsage: { totalTokens: 18 },
      structuredResult: { kind: "diagnosis", confidence: 0.9 }
    });
    expect(detail?.summary).toMatchObject({
      interventionCount: 3,
      tokenUsage: { inputTokens: 22, outputTokens: 14, totalTokens: 36, estimatedCostUsd: 0.004 }
    });
  });

  it("captures sanitized failure evidence once and reuses it for diagnosis and patch without persisting contents", async () => {
    const requests: any[] = [];
    const captures: any[] = [];
    const targetValidations: any[] = [];
    const evidence = { schemaVersion: "web-llm-evidence.v1", trust: "untrusted-page-evidence", location: "https://example.test/form", elements: [{ target: "target.1", tag: "button", selector: "#replacement", name: "SAFE_EVIDENCE_LABEL" }], truncated: false };
    const contentProtection = new AutomationStudioAesGcmProjectContentProtection(() => ({ keyId: "test.key", key: Buffer.alloc(32, 4) }));
    const service = createService({
      dataDir: tempRoot,
      seedFixture: false,
      llmProviderResolver: () => ({
        provider: {
          metadata: { provider: "mock", model: "evidence-model" },
          runTask: async (request) => {
            requests.push(request);
            return { response: request.taskKind === "runtime_patch"
              ? { kind: "runtime_patch", summary: "Use the observed replacement.", riskLevel: "high", patches: [{ kind: "temporary_target_override", targetNodeId: "divide", target: { handles: { control: "replacement" } }, reason: "The target changed." }] }
              : { kind: "diagnosis", summary: "The target changed." }, usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12 } };
          }
        },
        tokenLimits: { maxInputTokens: 4_000, maxOutputTokens: 1_000, maxTotalTokens: 5_000 },
        maxCallsPerRun: 2
      }),
      llmEvidenceRuntime: {
        domainId: "test.domain", tools: [],
        executeTool: async () => ({}),
        captureSanitizedFailureEvidence: async (input) => { captures.push(input); return evidence; },
        validateTargetOverrideEvidence: (captured, target, failedAction) => {
          targetValidations.push({ captured, target, failedAction });
          return { status: "resolved", target: { handles: { control: "replacement-resolved" } } };
        }
      },
      reusableLlmContext: {
        enabled: true,
        contentProtection,
        selectForFreshEvidence: () => ({ domainId: "domain.test", evidenceKind: "runtime_failure", evidenceSchemaVersion: "web-llm-evidence.v1", sanitizerVersion: "sanitizer.v1", compatibilityTags: [{ name: "page", value: "form" }] })
      }
    });
    const project = await service.createProject({ name: "Failure evidence" });
    const flow = await createFailingCanonicalFlow(service, project.id, { flowId: "flow.failure-evidence", metadata: adaptiveTrainingMetadata() });
    const runtimeSubflowId = (await service.listFlowSubflowSummaries({ projectId: project.id, flowId: flow.flowId, limit: 10, offset: 0 })).subflows[0]?.subflowId;
    expect(runtimeSubflowId).toBeTruthy();
    await service.putReusableLlmContext({ projectId: project.id, actorId: "fixture", record: {
      recordId: "context.runtime", flowId: flow.flowId, subflowId: runtimeSubflowId!, domainId: "domain.test", evidenceKind: "runtime_failure",
      evidenceSchemaVersion: "web-llm-evidence.v1", sanitizerVersion: "sanitizer.v1", compatibilityTags: [{ name: "page", value: "form" }],
      promptProjection: { facts: [{ kind: "action", definitionId: "web.click", status: "succeeded" }] }, outcome: "succeeded", reviewerState: "approved",
      sourceRunIds: ["run.prior"], sourceAdaptationIds: ["adaptation.prior"], ttlMs: 10_000
    } });

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, inputs: { numerator: 1, denominator: 0 }, useReusableContext: true, llmExecution: { grantId: "grant.failure-evidence", actorUserId: "user.test", actorSessionId: "session.test", purpose: "diagnose_and_adapt" } });
    const detail = await service.getFlowRunDetail(project.id, run.runId);

    expect(captures).toHaveLength(1);
    expect(captures[0]).toMatchObject({
      projectId: project.id,
      flowId: flow.flowId,
      runId: run.runId,
      failedAction: { nodeId: "divide", definitionId: "builtin.math.divide", status: "failed" },
      maxEvidenceBytes: 2_400
    });
    expect(Object.keys(captures[0].failedAction).sort()).toEqual(["attemptId", "definitionId", "nodeId", "route", "status"]);
    expect(requests.map((request) => request.taskKind)).toEqual(["runtime_diagnosis", "runtime_patch"]); expect(requests.map((request) => request.context.subflowId)).toEqual([runtimeSubflowId, runtimeSubflowId]);
    expect(requests[0].context.failureEvidence).toEqual(evidence);
    expect(requests[1].context.failureEvidence).toEqual(evidence);
    expect(requests[0].context.reusableContext).toMatchObject({ items: [{ advisory: true, recordId: "context.runtime", sourceRunIds: ["run.prior"], sourceAdaptationIds: ["adaptation.prior"] }] });
    expect(requests[1].context.reusableContext).toEqual(requests[0].context.reusableContext);
    expect(targetValidations).toEqual([{
      captured: evidence,
      target: { handles: { control: "replacement" } },
      failedAction: { nodeId: "divide", definitionId: "builtin.math.divide" }
    }]);
    expect(JSON.stringify(requests)).not.toContain("denominator");
    expect(detail?.interventions).toEqual(expect.arrayContaining([
      expect.objectContaining({ contextSummary: expect.objectContaining({ failureEvidence: expect.objectContaining({ schemaVersion: "web-llm-evidence.v1", byteCount: expect.any(Number), truncated: false, digest: expect.stringMatching(/^[a-f0-9]{64}$/) }) }) })
    ]));
    expect(detail?.metadata).toMatchObject({ llmGate: { failureEvidence: { schemaVersion: "web-llm-evidence.v1", truncated: false, digest: expect.stringMatching(/^[a-f0-9]{64}$/) }, reusableContext: { status: "hit", freshContributionCount: 1, reusedContributionCount: 1, sourceRunIds: ["run.prior"], sourceAdaptationIds: ["adaptation.prior"] } } });
    expect(JSON.stringify(detail)).not.toContain("SAFE_EVIDENCE_LABEL"); const recoveryContext = (detail?.metadata?.llmGate as any).recoveryContext; expect(recoveryContext).toMatchObject({ schemaVersion: "automation-studio.recovery-context-summary.v1", contextSchemaVersion: "automation-studio.recovery-context.v1", byteBudget: 4_000, budgetTruncated: false });
    expect(JSON.stringify(detail)).not.toContain("#replacement"); expect(recoveryContext.included.map((entry: any) => entry.section)).toContain("failure"); expect(recoveryContext.omitted).toEqual(expect.arrayContaining([{ section: "state_diff", reason: "absent", byteCount: 0 }]));
    expect(detail?.adaptationIds).toHaveLength(1);
    expect(detail?.changeProposalIds).toHaveLength(1);
    expect(detail?.summary.adaptationCount).toBe(1);
    const persistedSummary = (await service.listFlowRunSummaries({ projectId: project.id, flowId: flow.flowId, limit: 10, offset: 0 })).runs.find((summary) => summary.runId === run.runId);
    expect(persistedSummary?.adaptationCount).toBe(1);
    await expect(service.getFlowAdaptation(project.id, flow.flowId, detail!.adaptationIds[0]!)).resolves.toMatchObject({
      patch: [{ kind: "edit_action_target", after: { handles: { control: "replacement-resolved" } } }],
      metadata: { targetResolution: "resolved", reusableContext: { status: "hit", sourceRecordIds: ["context.runtime"] } }
    });
  });

  it("stops before provider invocation when applicable failure evidence is malformed", async () => {
    let providerCalls = 0;
    const service = createService({
      dataDir: tempRoot,
      seedFixture: false,
      llmProviderResolver: () => ({ metadata: { provider: "mock", model: "unused" }, runTask: async () => { providerCalls += 1; return { response: { kind: "diagnosis", summary: "unused" } }; } }),
      llmEvidenceRuntime: {
        domainId: "test.domain", deniedEvidenceKeys: ["html", "innerHtml", "outerHtml", "pageSource", "cookies", "headers", "selector"], tools: [],
        executeTool: async () => ({}),
        captureSanitizedFailureEvidence: async () => ({ schemaVersion: "web-llm-evidence.v1", snapshot: { html: "PRIVATE_RAW_HTML" } })
      }
    });
    const project = await service.createProject({ name: "Invalid failure evidence" });
    const flow = await createFailingCanonicalFlow(service, project.id, { flowId: "flow.invalid-failure-evidence", metadata: adaptiveTrainingMetadata() });

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, inputs: { numerator: 1, denominator: 0 } });
    const detail = await service.getFlowRunDetail(project.id, run.runId);

    expect(providerCalls).toBe(0);
    expect(detail?.metadata).toMatchObject({ llmGate: { invoked: false, providerConfigured: true, code: "llm.failure_evidence_invalid" } });
    expect(detail?.interventions).toEqual(expect.arrayContaining([expect.objectContaining({ validation: { ok: false, issues: [expect.stringContaining("llm.failure_evidence_invalid")] } })]));
    expect(JSON.stringify(detail)).not.toContain("PRIVATE_RAW_HTML");
  });

  it("stops before provider invocation when sanitized failure evidence exceeds the dynamic allowance", async () => {
    let providerCalls = 0;
    const service = createService({
      dataDir: tempRoot,
      seedFixture: false,
      llmProviderResolver: () => ({
        provider: { metadata: { provider: "mock", model: "unused" }, runTask: async () => { providerCalls += 1; return { response: { kind: "diagnosis", summary: "unused" } }; } },
        tokenLimits: { maxInputTokens: 1_000, maxOutputTokens: 500, maxTotalTokens: 1_500 }
      }),
      llmEvidenceRuntime: {
        domainId: "test.domain", tools: [],
        executeTool: async () => ({}),
        captureSanitizedFailureEvidence: async () => ({ schemaVersion: "web-llm-evidence.v1", summary: "x".repeat(700) })
      }
    });
    const project = await service.createProject({ name: "Oversized failure evidence" });
    const flow = await createFailingCanonicalFlow(service, project.id, { flowId: "flow.oversized-failure-evidence", metadata: adaptiveTrainingMetadata() });

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, inputs: { numerator: 1, denominator: 0 } });
    const detail = await service.getFlowRunDetail(project.id, run.runId);

    expect(providerCalls).toBe(0);
    expect(detail?.metadata).toMatchObject({ llmGate: { invoked: false, providerConfigured: true, code: "llm.failure_evidence_invalid" } });
    expect(JSON.stringify(detail)).not.toContain("xxx");
  });

  it("creates no proposal when a target override is absent from captured sanitized evidence", async () => {
    const service = createService({
      dataDir: tempRoot,
      seedFixture: false,
      llmProviderResolver: () => ({
        provider: { metadata: { provider: "mock", model: "absent-target" }, runTask: async (request) => ({
          response: request.taskKind === "runtime_patch"
            ? { kind: "runtime_patch", summary: "Candidate.", riskLevel: "high", patches: [{ kind: "temporary_target_override", targetNodeId: "divide", target: { handles: { control: "missing" } }, reason: "Try another target." }] }
            : { kind: "diagnosis", summary: "Target drift." },
          usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 }
        }) },
        tokenLimits: { maxInputTokens: 4_000, maxOutputTokens: 1_000, maxTotalTokens: 5_000 },
        maxCallsPerRun: 2
      }),
      llmEvidenceRuntime: {
        domainId: "test.domain", tools: [],
        executeTool: async () => ({}),
        captureSanitizedFailureEvidence: async () => ({ schemaVersion: "web-llm-evidence.v1", elements: [], truncated: false }),
        validateTargetOverrideEvidence: () => ({ status: "absent" })
      }
    });
    const project = await service.createProject({ name: "Absent target evidence" });
    const flow = await createFailingCanonicalFlow(service, project.id, { flowId: "flow.absent-target-evidence", metadata: adaptiveTrainingMetadata() });

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, inputs: { numerator: 1, denominator: 0 }, llmExecution: { grantId: "grant.absent-evidence", actorUserId: "user.test", actorSessionId: "session.test", purpose: "diagnose_and_adapt" } });
    const detail = await service.getFlowRunDetail(project.id, run.runId);

    expect(detail?.adaptationIds).toEqual([]);
    expect(detail?.changeProposalIds).toEqual([]);
    expect(detail?.metadata?.runtimePatchAttempts).toEqual(expect.arrayContaining([
      expect.objectContaining({ preflightOk: false, issues: ["Target override is absent from current sanitized evidence."] })
    ]));
    expect(JSON.stringify(detail)).not.toContain("#missing");
  });

  it("persists a sanitized terminal intervention when provider resolution throws", async () => {
    const service = createService({
      dataDir: tempRoot,
      seedFixture: false,
      llmProviderResolver: async () => { throw new Error("secret resolver detail must not persist"); }
    });
    const project = await service.createProject({ name: "Resolver failure" });
    const flow = await createFailingCanonicalFlow(service, project.id, { flowId: "flow.resolver-failure", metadata: adaptiveTrainingMetadata() });
    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, inputs: { numerator: 1, denominator: 0 } });
    const detail = await service.getFlowRunDetail(project.id, run.runId);
    expect(detail?.metadata).toMatchObject({ llmGate: { invoked: false, code: "llm.provider_resolution_failed" } });
    expect(detail?.interventions).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "LLM provider resolution failed.", validation: { ok: false, issues: [expect.stringContaining("llm.provider_resolution_failed")] } })]));
    expect(JSON.stringify(detail)).not.toContain("secret resolver detail");
  });

  it("uses manual approval runtime mode as diagnosis-only with no patch or promotion call", async () => {
    const taskKinds: string[] = [];
    const service = createService({
      dataDir: tempRoot,
      seedFixture: false,
      llmProviderResolver: () => ({
        metadata: { provider: "mock", model: "diagnosis-only-model" },
        runTask: async (request) => {
          taskKinds.push(request.taskKind);
          return {
            response: { kind: "diagnosis", summary: "The denominator is zero." },
            usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 }
          };
        }
      })
    });
    const project = await service.createProject({ name: "Diagnosis only" });
    const flow = await createFailingCanonicalFlow(service, project.id, { flowId: "flow.diagnosis-only", metadata: adaptiveTrainingMetadata() });

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, inputs: { numerator: 1, denominator: 0 }, adaptiveMode: "manual_approval" });
    const detail = await service.getFlowRunDetail(project.id, run.runId);

    expect(taskKinds).toEqual(["runtime_diagnosis"]);
    expect(detail?.adaptationIds).toEqual([]);
    expect(detail?.changeProposalIds).toEqual([]);
    expect(detail?.metadata).toMatchObject({
      trainingBehavior: { invokeLlm: true, createAdaptations: false, promoteAdaptations: false },
      llmGate: { invoked: true, providerConfigured: true, ok: true }
    });
  });
});
