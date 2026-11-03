import {
  createBlankAutomationStudioFlowArtifact,
  type AutomationStudioAdaptationPolicy,
  type AutomationStudioFlowAdaptation,
  type AutomationStudioFlowArtifact,
  type AutomationStudioFlowChangeProposal,
  type AutomationStudioFlowInstruction,
  type AutomationStudioFlowRouter,
  type AutomationStudioFlowRunDetail,
  type AutomationStudioFlowRunSummary,
  type AutomationStudioFlowSubflow
} from "../index.ts";

export type AutomationStudioFlowExpansionFixture = {
  flow: AutomationStudioFlowArtifact;
  router: AutomationStudioFlowRouter;
  subflows: AutomationStudioFlowSubflow[];
  instructions: AutomationStudioFlowInstruction[];
  changeProposal: AutomationStudioFlowChangeProposal;
  runSummary: AutomationStudioFlowRunSummary;
  runDetail: AutomationStudioFlowRunDetail;
  adaptation: AutomationStudioFlowAdaptation;
  policy: AutomationStudioAdaptationPolicy;
};

export function createAutomationStudioFlowExpansionFixture(nowMs = 2_000): AutomationStudioFlowExpansionFixture {
  const projectId = "project.adaptive-demo";
  const flowId = "flow.adaptive-demo";
  const routerId = "router.adaptive-demo";
  const primarySubflowId = "subflow.primary";
  const recoverySubflowId = "subflow.dismiss-popup";
  const instructionId = "instruction.flow.goal";
  const adaptationId = "adaptation.dismiss-popup";
  const proposalId = "proposal.dismiss-popup";
  const runId = "run.adaptive-demo.1";
  const policyId = "adaptation-policy.adaptive-demo";

  const subflows: AutomationStudioFlowSubflow[] = [
    { schemaVersion: "0.1", subflowId: primarySubflowId, flowId, projectId, name: "Primary path", role: "primary", status: "active", tags: ["primary"], createdAt: nowMs, updatedAt: nowMs },
    { schemaVersion: "0.1", subflowId: recoverySubflowId, flowId, projectId, name: "Dismiss popup", role: "recovery", status: "active", tags: ["recovery", "popup"], createdAt: nowMs, updatedAt: nowMs }
  ];

  const router: AutomationStudioFlowRouter = {
    schemaVersion: "0.1",
    routerId,
    flowId,
    projectId,
    name: "Adaptive demo router",
    rules: [
      { schemaVersion: "0.1", ruleId: "route.primary", routerId, name: "Primary route", target: { kind: "subflow", subflowId: primarySubflowId }, order: 0, status: "active", confidence: 0.9, createdAt: nowMs, updatedAt: nowMs }
    ],
    fallback: { kind: "subflow", subflowId: recoverySubflowId },
    status: "active",
    createdAt: nowMs,
    updatedAt: nowMs
  };

  const instructions: AutomationStudioFlowInstruction[] = [
    {
      schemaVersion: "0.1",
      instructionId,
      title: "Prefer deterministic recovery",
      body: "When a popup blocks progress, dismiss it once and retry the original action before asking for manual help.",
      scope: { kind: "flow", projectId, flowId },
      priority: 100,
      status: "active",
      requirement: "advisory",
      tags: ["runtime", "error", "safety"],
      createdAt: nowMs,
      updatedAt: nowMs
    }
  ];

  const changeProposal: AutomationStudioFlowChangeProposal = {
    schemaVersion: "0.1",
    proposalId,
    flowId,
    projectId,
    subflowId: recoverySubflowId,
    sourceRunId: runId,
    sourceAdaptationId: adaptationId,
    sourceInstructionIds: [instructionId],
    mode: "auto",
    status: "auto_approved",
    riskLevel: "low",
    patches: [{ kind: "create_subflow", targetId: recoverySubflowId, summary: "Create a recovery subflow that dismisses a blocking popup." }],
    createdBy: "llm",
    createdAt: nowMs + 10,
    updatedAt: nowMs + 10
  };

  const adaptation: AutomationStudioFlowAdaptation = {
    schemaVersion: "0.1",
    adaptationId,
    flowId,
    projectId,
    subflowId: recoverySubflowId,
    sourceRunId: runId,
    sourceInstructionIds: [instructionId],
    trigger: "popup.visible blocks primary action",
    diagnosis: "A popup blocked the expected primary action target.",
    patch: changeProposal.patches,
    validationResults: [{ runId, status: "succeeded", checkedAt: nowMs + 20 }],
    appliedTo: [{ kind: "subflow", id: recoverySubflowId }],
    status: "validated",
    author: "llm",
    riskLevel: "low",
    proposalId,
    createdAt: nowMs + 10,
    updatedAt: nowMs + 20
  };

  const policy: AutomationStudioAdaptationPolicy = {
    schemaVersion: "0.1",
    policyId,
    scope: { kind: "flow", flowId },
    preset: "adaptive",
    proposalMode: "auto",
    allowRuntimeRecovery: true,
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
    maxInterventionsPerRun: 3,
    maxEstimatedCostUsdPerRun: 1,
    createdAt: nowMs,
    updatedAt: nowMs
  };

  const runSummary: AutomationStudioFlowRunSummary = {
    schemaVersion: "0.1",
    runId,
    flowId,
    projectId,
    status: "succeeded",
    startedAt: nowMs + 1,
    finishedAt: nowMs + 30,
    updatedAt: nowMs + 30,
    routeDecisionCount: 1,
    subflowEntryCount: 2,
    actionAttemptCount: 3,
    interventionCount: 1,
    adaptationCount: 1,
    tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.01 }
  };

  const runDetail: AutomationStudioFlowRunDetail = {
    schemaVersion: "0.1",
    summary: runSummary,
    inputs: { demo: true },
    routeDecisions: [{ decisionId: "decision.primary", routerId, selectedRuleId: "route.primary", selectedSubflowId: primarySubflowId, decidedAt: nowMs + 2 }],
    subflows: [
      { entryId: "subflow-entry.primary", subflowId: primarySubflowId, enteredAt: nowMs + 3, exitedAt: nowMs + 12, status: "waiting" },
      { entryId: "subflow-entry.recovery", subflowId: recoverySubflowId, enteredAt: nowMs + 13, exitedAt: nowMs + 20, status: "succeeded" }
    ],
    interventions: [
      {
        schemaVersion: "0.1",
        interventionId: "intervention.dismiss-popup",
        runId,
        flowId,
        projectId,
        kind: "runtime_patch",
        reason: "Known Flow structure could not handle a popup.",
        promptVersion: "runtime_patch.v1",
        provider: "fixture",
        model: "fixture",
        instructionIds: [instructionId],
        validation: { ok: true },
        ...(runSummary.tokenUsage ? { tokenUsage: runSummary.tokenUsage } : {}),
        createdAt: nowMs + 12
      }
    ],
    adaptationIds: [adaptationId],
    changeProposalIds: [proposalId]
  };

  const flow = {
    ...createBlankAutomationStudioFlowArtifact({ flowId, projectId, name: "Adaptive demo", now: nowMs }),
    expansion: {
      routerId,
      subflowIds: subflows.map((subflow) => subflow.subflowId),
      instructionIds: instructions.map((instruction) => instruction.instructionId),
      changeProposalIds: [proposalId],
      runIds: [runId],
      adaptationIds: [adaptationId],
      adaptationPolicyId: policyId
    }
  };

  return { flow, router, subflows, instructions, changeProposal, runSummary, runDetail, adaptation, policy };
}
