import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioService } from "../../../service.ts";
import { createRunnableCanonicalFlow, adaptiveTrainingMetadata } from "../../service-fixtures.ts";

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

  it("resolves runtime adaptation behavior into Flow run detail metadata", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Runtime adaptation context" });
    const flow = await createRunnableCanonicalFlow(service, project.id, { flowId: "flow.runtime-context" });

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });
    const detail = await service.getFlowRunDetail(project.id, run.runId);

    expect(detail?.metadata).toMatchObject({
      trainingMode: "normal",
      trainingBehavior: {
        invokeLlm: false,
        runRecovery: true,
        createAdaptations: false,
        promoteAdaptations: false
      },
      runtimeAdaptationContext: {
        flowId: flow.flowId,
        mode: "normal",
        policyId: "policy.default",
        policyPreset: "locked",
        approvalMode: "manual",
        runsCompleted: 0,
        budget: { ok: true },
        diagnostics: expect.arrayContaining([
          "LLM intervention is disabled by training mode or settings.",
          "Adaptation creation is disabled by training mode or settings.",
          "Runtime recovery is disabled by adaptation policy.",
          "Normal mode records adaptive context without invoking LLM."
        ])
      }
    });
  });

  it("resolves configured recovery limits into the runtime adaptation context", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Recovery limits" });
    const flow = await createRunnableCanonicalFlow(service, project.id, {
      flowId: "flow.recovery-limits",
      metadata: {
        trainingModeSettings: {
          mode: "continuous_adaptive",
          allowLlmIntervention: true,
          allowRuntimeRecovery: true,
          allowAdaptationCreation: true,
          proposalApprovalMode: "auto",
          allowPromotion: true,
          recoveryBudget: { maxRetriesPerAction: 4, maxRecoveryAttemptsPerSubflow: 5, maxReroutesPerRun: 6 },
          budgets: { maxInterventionsPerRun: 2, maxTokensPerRun: 12000, maxCostUsdPerTrainingWindow: 5, exhaustedBehavior: "ask" }
        }
      }
    });

    await expect(service.resolveRuntimeAdaptationContext({ projectId: project.id, flow })).resolves.toMatchObject({
      settings: { recoveryBudget: { maxRetriesPerAction: 4, maxRecoveryAttemptsPerSubflow: 5, maxReroutesPerRun: 6 } }
    });
  });

  it("activates train-for-runs only for runs inside the training window", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Train for runs" });
    const flow = await createRunnableCanonicalFlow(service, project.id, {
      flowId: "flow.train-for-runs",
      metadata: {
        trainingModeSettings: {
          mode: "train_for_runs",
          trainForRunCount: 1,
          allowLlmIntervention: true,
          allowRuntimeRecovery: true,
          allowAdaptationCreation: true,
          proposalApprovalMode: "auto",
          allowPromotion: true,
          budgets: { maxInterventionsPerRun: 2, maxTokensPerRun: 12000, maxCostUsdPerTrainingWindow: 5, exhaustedBehavior: "ask" }
        }
      }
    });

    const first = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });
    const second = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });

    await expect(service.getFlowRunDetail(project.id, first.runId)).resolves.toMatchObject({
      metadata: { trainingBehavior: { invokeLlm: true, createAdaptations: true, promoteAdaptations: true }, runtimeAdaptationContext: { runsCompleted: 0 } }
    });
    await expect(service.getFlowRunDetail(project.id, second.runId)).resolves.toMatchObject({
      metadata: { trainingBehavior: { invokeLlm: false, createAdaptations: false, promoteAdaptations: false }, runtimeAdaptationContext: { runsCompleted: 1 } }
    });
  });

  it("resolves stable and continuous adaptive modes plus budget exhaustion", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Adaptive modes" });
    const stableFlow = await createRunnableCanonicalFlow(service, project.id, {
      flowId: "flow.train-until-stable",
      metadata: {
        ...adaptiveTrainingMetadata(),
        trainingModeSettings: {
          mode: "train_until_stable",
          minimumStabilityScore: 0.5,
          allowLlmIntervention: true,
          allowRuntimeRecovery: true,
          allowAdaptationCreation: true,
          proposalApprovalMode: "auto",
          allowPromotion: true,
          budgets: { maxInterventionsPerRun: 2, maxTokensPerRun: 12000, maxCostUsdPerTrainingWindow: 5, exhaustedBehavior: "ask" }
        }
      }
    });
    const continuousFlow = await createRunnableCanonicalFlow(service, project.id, {
      flowId: "flow.continuous",
      metadata: {
        ...adaptiveTrainingMetadata(),
        trainingModeSettings: {
          mode: "continuous_adaptive",
          allowLlmIntervention: true,
          allowRuntimeRecovery: true,
          allowAdaptationCreation: true,
          proposalApprovalMode: "auto",
          allowPromotion: true,
          budgets: { maxInterventionsPerRun: 2, maxTokensPerRun: 12000, maxCostUsdPerTrainingWindow: 0.001, exhaustedBehavior: "stop" }
        }
      }
    });
    await service.saveFlowRunDetail({
      schemaVersion: "0.1",
      summary: {
        schemaVersion: "0.1",
        projectId: project.id,
        flowId: stableFlow.flowId,
        runId: "run.stable.previous",
        status: "succeeded",
        startedAt: 1,
        finishedAt: 2,
        updatedAt: 2,
        routeDecisionCount: 0,
        subflowEntryCount: 0,
        actionAttemptCount: 0,
        interventionCount: 0,
        adaptationCount: 0
      },
      routeDecisions: [],
      subflows: [],
      interventions: [],
      adaptationIds: [],
      changeProposalIds: []
    });
    await service.saveFlowRunDetail({
      schemaVersion: "0.1",
      summary: {
        schemaVersion: "0.1",
        projectId: project.id,
        flowId: continuousFlow.flowId,
        runId: "run.cost.previous",
        status: "succeeded",
        startedAt: 1,
        finishedAt: 2,
        updatedAt: 2,
        routeDecisionCount: 0,
        subflowEntryCount: 0,
        actionAttemptCount: 0,
        interventionCount: 1,
        adaptationCount: 0,
        tokenUsage: { estimatedCostUsd: 0.01 }
      },
      routeDecisions: [],
      subflows: [],
      interventions: [],
      adaptationIds: [],
      changeProposalIds: []
    });

    const stableRun = await service.runRuntimeSession({ projectId: project.id, flowId: stableFlow.flowId });
    const continuousRun = await service.runRuntimeSession({ projectId: project.id, flowId: continuousFlow.flowId });

    await expect(service.getFlowRunDetail(project.id, stableRun.runId)).resolves.toMatchObject({
      metadata: { trainingBehavior: { invokeLlm: false, createAdaptations: false, promoteAdaptations: false }, runtimeAdaptationContext: { runsCompleted: 1 } }
    });
    await expect(service.getFlowRunDetail(project.id, continuousRun.runId)).resolves.toMatchObject({
      metadata: {
        trainingBehavior: { invokeLlm: true, createAdaptations: true, promoteAdaptations: true },
        runtimeAdaptationContext: {
          budget: { ok: false, behavior: "stop", exhausted: ["max cost per training window"] },
          diagnostics: expect.arrayContaining(["Training budget exhausted: max cost per training window."])
        }
      }
    });
  });
});
