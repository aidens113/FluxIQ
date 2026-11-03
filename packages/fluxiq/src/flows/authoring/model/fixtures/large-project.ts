import {
  createBlankAutomationStudioFlowArtifact,
  type AutomationStudioAdaptationPolicy,
  type AutomationStudioFlowAdaptation,
  type AutomationStudioFlowArtifact,
  type AutomationStudioFlowChangeProposal,
  type AutomationStudioFlowInstruction,
  type AutomationStudioFlowRouter,
  type AutomationStudioFlowRunDetail,
  type AutomationStudioFlowSubflow,
  type RecordingSession
} from "../index.ts";
import { createAutomationStudioFixture } from "./recorded-task.ts";

export type AutomationStudioLargeProjectFixtureOptions = {
  projectId?: string;
  flowCount?: number;
  subflowsPerFlow?: number;
  runsPerFlow?: number;
  adaptationsPerFlow?: number;
  instructionsPerFlow?: number;
  recordingCount?: number;
  nowMs?: number;
};

export type AutomationStudioLargeProjectFixture = {
  projectId: string;
  flows: AutomationStudioFlowArtifact[];
  routers: AutomationStudioFlowRouter[];
  subflows: AutomationStudioFlowSubflow[];
  instructions: AutomationStudioFlowInstruction[];
  changeProposals: AutomationStudioFlowChangeProposal[];
  runDetails: AutomationStudioFlowRunDetail[];
  adaptations: AutomationStudioFlowAdaptation[];
  policies: AutomationStudioAdaptationPolicy[];
  recordings: RecordingSession[];
};

export function createAutomationStudioLargeProjectFixture(options: AutomationStudioLargeProjectFixtureOptions = {}): AutomationStudioLargeProjectFixture {
  const projectId = options.projectId ?? "project.large-adaptive";
  const flowCount = Math.max(1, options.flowCount ?? 8);
  const subflowsPerFlow = Math.max(1, options.subflowsPerFlow ?? 6);
  const runsPerFlow = Math.max(0, options.runsPerFlow ?? 40);
  const adaptationsPerFlow = Math.max(0, options.adaptationsPerFlow ?? 16);
  const instructionsPerFlow = Math.max(0, options.instructionsPerFlow ?? 12);
  const recordingCount = Math.max(0, options.recordingCount ?? 10);
  const nowMs = options.nowMs ?? 50_000;

  const flows: AutomationStudioFlowArtifact[] = [];
  const routers: AutomationStudioFlowRouter[] = [];
  const subflows: AutomationStudioFlowSubflow[] = [];
  const instructions: AutomationStudioFlowInstruction[] = [];
  const changeProposals: AutomationStudioFlowChangeProposal[] = [];
  const runDetails: AutomationStudioFlowRunDetail[] = [];
  const adaptations: AutomationStudioFlowAdaptation[] = [];
  const policies: AutomationStudioAdaptationPolicy[] = [];

  for (let flowIndex = 0; flowIndex < flowCount; flowIndex += 1) {
    const flowId = `flow.large.${flowIndex}`;
    const routerId = `router.large.${flowIndex}`;
    const flowSubflows = Array.from({ length: subflowsPerFlow }, (_, subflowIndex): AutomationStudioFlowSubflow => ({
      schemaVersion: "0.1",
      subflowId: `subflow.large.${flowIndex}.${subflowIndex}`,
      flowId,
      projectId,
      name: subflowIndex === 0 ? `Primary ${flowIndex}` : `Recovery ${flowIndex}.${subflowIndex}`,
      role: subflowIndex === 0 ? "primary" : "recovery",
      status: "active",
      routeTags: [subflowIndex === 0 ? "primary" : "recovery", `flow-${flowIndex}`],
      createdAt: nowMs + flowIndex,
      updatedAt: nowMs + flowIndex
    }));
    subflows.push(...flowSubflows);

    routers.push({
      schemaVersion: "0.1",
      routerId,
      flowId,
      projectId,
      name: `Large router ${flowIndex}`,
      rules: flowSubflows.slice(0, Math.min(flowSubflows.length, 4)).map((subflow, ruleIndex) => ({
        schemaVersion: "0.1",
        ruleId: `route.large.${flowIndex}.${ruleIndex}`,
        routerId,
        name: `Route ${ruleIndex}`,
        target: { kind: "subflow", subflowId: subflow.subflowId },
        condition: { signalPath: `inputs.route${ruleIndex}`, operator: "equals", expected: true },
        order: ruleIndex,
        status: "active",
        createdAt: nowMs + flowIndex,
        updatedAt: nowMs + flowIndex
      })),
      fallback: { kind: "subflow", subflowId: flowSubflows[0]!.subflowId },
      status: "active",
      createdAt: nowMs + flowIndex,
      updatedAt: nowMs + flowIndex
    });

    const flowInstructions = Array.from({ length: instructionsPerFlow }, (_, instructionIndex): AutomationStudioFlowInstruction => ({
      schemaVersion: "0.1",
      instructionId: `instruction.large.${flowIndex}.${instructionIndex}`,
      title: `Instruction ${flowIndex}.${instructionIndex}`,
      body: `Prefer deterministic handling for large fixture flow ${flowIndex}, instruction ${instructionIndex}.`,
      scope: instructionIndex % 3 === 0
        ? { kind: "subflow", projectId, flowId, subflowId: flowSubflows[instructionIndex % flowSubflows.length]!.subflowId }
        : { kind: "flow", projectId, flowId },
      priority: 100 - instructionIndex,
      status: "active",
      requirement: instructionIndex % 5 === 0 ? "required" : "advisory",
      createdAt: nowMs + instructionIndex,
      updatedAt: nowMs + instructionIndex
    }));
    instructions.push(...flowInstructions);

    const flowChangeProposals: AutomationStudioFlowChangeProposal[] = Array.from({ length: Math.max(1, Math.ceil(adaptationsPerFlow / 2)) }, (_, proposalIndex) => ({
      schemaVersion: "0.1",
      proposalId: `proposal.large.${flowIndex}.${proposalIndex}`,
      flowId,
      projectId,
      subflowId: flowSubflows[(proposalIndex + 1) % flowSubflows.length]!.subflowId,
      sourceRunId: `run.large.${flowIndex}.${proposalIndex}`,
      mode: proposalIndex % 3 === 0 ? "manual" : "auto",
      status: proposalIndex % 3 === 0 ? "pending" : "auto_approved",
      riskLevel: proposalIndex % 4 === 0 ? "medium" : "low",
      patches: [{ kind: "edit_subflow", targetId: flowSubflows[(proposalIndex + 1) % flowSubflows.length]!.subflowId, summary: `Tune subflow ${proposalIndex}.` }],
      createdBy: proposalIndex % 2 === 0 ? "llm" : "runtime",
      createdAt: nowMs + proposalIndex,
      updatedAt: nowMs + proposalIndex
    }));
    changeProposals.push(...flowChangeProposals);

    for (let runIndex = 0; runIndex < runsPerFlow; runIndex += 1) {
      const runId = `run.large.${flowIndex}.${runIndex}`;
      runDetails.push({
        schemaVersion: "0.1",
        summary: {
          schemaVersion: "0.1",
          runId,
          flowId,
          projectId,
          status: runIndex % 11 === 0 ? "failed" : "succeeded",
          startedAt: nowMs + runIndex,
          finishedAt: nowMs + runIndex + 5,
          updatedAt: nowMs + runIndex,
          routeDecisionCount: 1,
          subflowEntryCount: 1,
          actionAttemptCount: 2 + (runIndex % 5),
          interventionCount: runIndex % 7 === 0 ? 1 : 0,
          adaptationCount: runIndex % 9 === 0 ? 1 : 0,
          ...(runIndex % 7 === 0 ? { tokenUsage: { inputTokens: 20, outputTokens: 10, totalTokens: 30, estimatedCostUsd: 0.002 } } : {})
        },
        inputs: { route: runIndex % 4 },
        routeDecisions: [{ decisionId: `decision.large.${flowIndex}.${runIndex}`, routerId, selectedRuleId: `route.large.${flowIndex}.0`, selectedSubflowId: flowSubflows[0]!.subflowId, decidedAt: nowMs + runIndex }],
        subflows: [{ entryId: `entry.large.${flowIndex}.${runIndex}`, subflowId: flowSubflows[0]!.subflowId, enteredAt: nowMs + runIndex, exitedAt: nowMs + runIndex + 3, status: "succeeded" }],
        interventions: runIndex % 7 === 0 ? [{
          schemaVersion: "0.1",
          interventionId: `intervention.large.${flowIndex}.${runIndex}`,
          runId,
          flowId,
          projectId,
          kind: "diagnosis",
          reason: "Large fixture diagnostic sample.",
          promptVersion: "diagnosis_only_report.v1",
          provider: "fixture",
          model: "fixture",
          tokenUsage: { inputTokens: 20, outputTokens: 10, totalTokens: 30, estimatedCostUsd: 0.002 },
          validation: { ok: true },
          createdAt: nowMs + runIndex
        }] : [],
        adaptationIds: runIndex % 9 === 0 ? [`adaptation.large.${flowIndex}.${runIndex % Math.max(1, adaptationsPerFlow)}`] : [],
        changeProposalIds: runIndex % 9 === 0 ? [flowChangeProposals[runIndex % flowChangeProposals.length]!.proposalId] : []
      });
    }

    for (let adaptationIndex = 0; adaptationIndex < adaptationsPerFlow; adaptationIndex += 1) {
      adaptations.push({
        schemaVersion: "0.1",
        adaptationId: `adaptation.large.${flowIndex}.${adaptationIndex}`,
        flowId,
        projectId,
        subflowId: flowSubflows[(adaptationIndex + 1) % flowSubflows.length]!.subflowId,
        sourceRunId: `run.large.${flowIndex}.${adaptationIndex % Math.max(1, runsPerFlow)}`,
        trigger: `Large fixture trigger ${adaptationIndex}`,
        diagnosis: "Deterministic fixture adaptation used for summary and cost regression tests.",
        patch: [{ kind: "edit_expectation", targetId: `expectation.large.${adaptationIndex}`, summary: "Tighten expected state." }],
        validationResults: [{ runId: `run.validation.${flowIndex}.${adaptationIndex}`, status: "succeeded", checkedAt: nowMs + adaptationIndex }],
        status: adaptationIndex % 4 === 0 ? "applied" : "validated",
        author: adaptationIndex % 2 === 0 ? "llm" : "runtime",
        riskLevel: adaptationIndex % 5 === 0 ? "medium" : "low",
        proposalId: flowChangeProposals[adaptationIndex % flowChangeProposals.length]!.proposalId,
        createdAt: nowMs + adaptationIndex,
        updatedAt: nowMs + adaptationIndex
      });
    }

    policies.push({
      schemaVersion: "0.1",
      policyId: `adaptation-policy.large.${flowIndex}`,
      scope: { kind: "flow", flowId },
      preset: flowIndex % 3 === 0 ? "observe" : "adaptive",
      proposalMode: flowIndex % 3 === 0 ? "manual" : "auto",
      allowRuntimeRecovery: flowIndex % 3 !== 0,
      allowCreateRecoveryPaths: true,
      allowModifySubflows: true,
      allowCreateSubflows: true,
      allowModifyRouter: true,
      allowModifyExpectations: true,
      allowModifyActionTargets: true,
      allowDeleteOrDisableBehavior: false,
      allowExternalSideEffects: false,
      requireApprovalForDestructiveChanges: true,
      requireApprovalForExternalSideEffects: true,
      maxInterventionsPerRun: 2,
      maxEstimatedCostUsdPerRun: 0.25,
      createdAt: nowMs + flowIndex,
      updatedAt: nowMs + flowIndex
    });

    flows.push({
      ...createBlankAutomationStudioFlowArtifact({ flowId, projectId, name: `Large Adaptive Flow ${flowIndex}`, now: nowMs + flowIndex }),
      expansion: {
        routerId,
        subflowIds: flowSubflows.map((subflow) => subflow.subflowId),
        instructionIds: flowInstructions.map((instruction) => instruction.instructionId),
        changeProposalIds: flowChangeProposals.map((proposal) => proposal.proposalId),
        runIds: Array.from({ length: runsPerFlow }, (_, runIndex) => `run.large.${flowIndex}.${runIndex}`),
        adaptationIds: Array.from({ length: adaptationsPerFlow }, (_, adaptationIndex) => `adaptation.large.${flowIndex}.${adaptationIndex}`),
        adaptationPolicyId: `adaptation-policy.large.${flowIndex}`
      }
    });
  }

  const recordingTemplate = createAutomationStudioFixture(nowMs).recording;
  const recordings = Array.from({ length: recordingCount }, (_, recordingIndex): RecordingSession => ({
    ...recordingTemplate,
    recordingId: `recording.large.${recordingIndex}`,
    startedAt: nowMs + recordingIndex,
    metadata: {
      ...(recordingTemplate.metadata ?? {}),
      projectId,
      title: `Large optional recording ${recordingIndex}`,
      updatedAt: nowMs + recordingIndex
    }
  }));

  return { projectId, flows, routers, subflows, instructions, changeProposals, runDetails, adaptations, policies, recordings };
}
