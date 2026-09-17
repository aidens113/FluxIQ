import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowAdaptationValidationResult, AutomationStudioFlowRunDetail, AutomationStudioFlowRunSummary } from "../../model/index.ts";
import { decideAutomationStudioChangeConfidence, type AutomationStudioChangeConfidenceDecision } from "../flow-change/index.ts";
import {
  annotateRunDetailWithTrainingMode,
  automationStudioScopeIsFrozen,
  behaviorForAutomationStudioTrainingMode,
  computeAutomationStudioStabilityMetrics,
  createAutomationStudioTrainingStatus,
  decideAutomationStudioAdaptationPromotionGate,
  decideAutomationStudioBootstrapApplyGate,
  decideAutomationStudioLlmInvocationGate,
  decideAutomationStudioProposalApprovalGate,
  decideAutomationStudioTrainingBudget,
  summarizeAutomationStudioUncertainty,
  type AutomationStudioBootstrapApplyGateInput,
  type AutomationStudioTrainingAdaptationSummary,
  type AutomationStudioTrainingModeSettings
} from "../training-modes.ts";

let clock = 0;

function legacy(status: "succeeded" | "failed", kind?: "trial" | "replay"): AutomationStudioFlowAdaptationValidationResult {
  clock += 1;
  return { runId: `run.${clock}`, status, checkedAt: clock, ...(kind ? { kind } : {}) };
}

const trial = (status: "succeeded" | "failed" = "succeeded") => legacy(status, "trial");
const replay = (status: "succeeded" | "failed" = "succeeded") => legacy(status, "replay");

function tierOf(validationResults: AutomationStudioFlowAdaptationValidationResult[], riskLevel: "low" | "medium" | "high" | "destructive" = "low"): AutomationStudioChangeConfidenceDecision {
  return decideAutomationStudioChangeConfidence({ validationResults, riskLevel });
}

describe("Automation Studio training modes", () => {
  it("derives behavior for normal, train-for-runs, train-until-stable, and continuous modes", () => {
    expect(behaviorForAutomationStudioTrainingMode(settings({ mode: "normal" }))).toMatchObject({ invokeLlm: false, createAdaptations: false, promoteAdaptations: false });
    expect(behaviorForAutomationStudioTrainingMode(settings({ mode: "train_for_runs", trainForRunCount: 3 }), 2)).toMatchObject({ invokeLlm: true, createAdaptations: true });
    expect(behaviorForAutomationStudioTrainingMode(settings({ mode: "train_for_runs", trainForRunCount: 3 }), 3)).toMatchObject({ invokeLlm: false, createAdaptations: false });
    expect(behaviorForAutomationStudioTrainingMode(settings({ mode: "train_until_stable", minimumStabilityScore: 0.8 }), 4, 0.6)).toMatchObject({ invokeLlm: true, promoteAdaptations: true });
    expect(behaviorForAutomationStudioTrainingMode(settings({ mode: "train_until_stable", minimumStabilityScore: 0.8 }), 4, 0.9)).toMatchObject({ invokeLlm: false, promoteAdaptations: false });
    expect(behaviorForAutomationStudioTrainingMode(settings({ mode: "continuous_adaptive" }), 50, 1)).toMatchObject({ invokeLlm: true, createAdaptations: true, promoteAdaptations: true });
  });

  it("computes stability metrics and uncertainty summaries", () => {
    const runs = [
      run({ runId: "run.1", status: "succeeded", interventionCount: 0 }),
      run({ runId: "run.2", status: "succeeded", interventionCount: 1 }),
      run({ runId: "run.3", status: "failed", interventionCount: 1 })
    ];
    const adaptations = [
      adaptation({ adaptationId: "adaptation.1", status: "applied", trigger: "missing confirmation", updatedAt: 90 }),
      adaptation({ adaptationId: "adaptation.2", status: "rejected", trigger: "missing confirmation", updatedAt: 95, subflowId: "subflow.checkout" })
    ];

    const metrics = computeAutomationStudioStabilityMetrics({ runs, adaptations, now: 100 });
    const uncertainty = summarizeAutomationStudioUncertainty({
      flowId: "flow.checkout",
      runs,
      adaptations,
      subflows: [{ schemaVersion: "0.1", subflowId: "subflow.checkout", flowId: "flow.checkout", projectId: "project.train", name: "Checkout", role: "primary", status: "active", createdAt: 1, updatedAt: 1 }],
      pendingProposalCount: 2
    });

    expect(metrics).toMatchObject({
      deterministicSuccessRuns: 1,
      unresolvedFailures: 1,
      acceptedAdaptations: 1,
      rejectedAdaptations: 1,
      msSinceLastStructuralChange: 10
    });
    expect(metrics.repeatedTriggers).toEqual([{ trigger: "missing confirmation", count: 2 }]);
    expect(uncertainty.map((item) => item.scope).sort()).toEqual(["flow", "subflow"]);
    expect(uncertainty.find((item) => item.scope === "flow")).toMatchObject({ pendingProposalCount: 2 });
  });

  it("decides budget exhaustion behavior", () => {
    const decision = decideAutomationStudioTrainingBudget(settings({
      budgets: { maxInterventionsPerRun: 1, maxTokensPerRun: 100, maxCostUsdPerTrainingWindow: 0.25, exhaustedBehavior: "ask" }
    }), { interventionsThisRun: 1, tokensThisRun: 80, costUsdThisTrainingWindow: 0.1 });

    expect(decision).toEqual({ ok: false, exhausted: ["max interventions per run"], behavior: "ask" });
  });

  it("gates LLM invocation behind expected-state, recovery, reroute, budget, and policy checks", () => {
    const adaptive = settings({ mode: "continuous_adaptive", proposalApprovalMode: "auto" });

    expect(decideAutomationStudioLlmInvocationGate({ settings: adaptive, expectedStateMatched: true })).toMatchObject({ invoke: false, requiredPriorAction: "none" });
    expect(decideAutomationStudioLlmInvocationGate({ settings: adaptive, knownRecoveryAvailable: true })).toMatchObject({ invoke: false, requiredPriorAction: "known_recovery" });
    expect(decideAutomationStudioLlmInvocationGate({ settings: adaptive, rerouteAvailable: true })).toMatchObject({ invoke: false, requiredPriorAction: "reroute" });
    expect(decideAutomationStudioLlmInvocationGate({
      settings: settings({
        mode: "continuous_adaptive",
        proposalApprovalMode: "auto",
        budgets: { maxInterventionsPerRun: 1, exhaustedBehavior: "stop" }
      }),
      budgetState: { interventionsThisRun: 1, tokensThisRun: 0, costUsdThisTrainingWindow: 0 }
    })).toMatchObject({ invoke: false, requiredPriorAction: "stop" });
    expect(decideAutomationStudioLlmInvocationGate({ settings: adaptive, policyPreset: "locked" })).toMatchObject({ invoke: false, requiredPriorAction: "manual_approval" });
    expect(decideAutomationStudioLlmInvocationGate({ settings: adaptive, policyPreset: "observe" })).toMatchObject({ invoke: false, requiredPriorAction: "manual_approval" });
    expect(decideAutomationStudioLlmInvocationGate({ settings: settings({ mode: "continuous_adaptive", proposalApprovalMode: "manual" }) })).toMatchObject({ invoke: false, requiredPriorAction: "manual_approval" });
    expect(decideAutomationStudioLlmInvocationGate({ settings: adaptive })).toMatchObject({ invoke: true, requiredPriorAction: "none" });
  });

  it("decides proposal approval mode without letting recordings directly generate proposals", () => {
    expect(decideAutomationStudioProposalApprovalGate({
      proposalMode: "auto",
      riskLevel: "low",
      patchKinds: ["edit_expectation"],
      validated: true,
      sourceKind: "adaptation"
    })).toEqual({
      createProposal: true,
      status: "auto_approved",
      requiresManualApproval: false,
      reason: "Validated low-risk proposal can proceed automatically."
    });
    expect(decideAutomationStudioProposalApprovalGate({
      proposalMode: "manual",
      riskLevel: "low",
      patchKinds: ["edit_expectation"],
      validated: true,
      sourceKind: "run"
    })).toMatchObject({ createProposal: true, status: "pending", requiresManualApproval: true });
    expect(decideAutomationStudioProposalApprovalGate({
      proposalMode: "mixed",
      riskLevel: "medium",
      patchKinds: ["edit_router"],
      validated: true,
      sourceKind: "instruction"
    })).toMatchObject({ createProposal: true, status: "pending", requiresManualApproval: true });
    expect(decideAutomationStudioProposalApprovalGate({
      proposalMode: "auto",
      riskLevel: "low",
      patchKinds: ["create_subflow"],
      validated: true,
      sourceKind: "recording"
    })).toMatchObject({ createProposal: false, requiresManualApproval: false });
  });

  it("decides adaptation auto-promotion policy for safe, manual, structural, destructive, and first-review gates", () => {
    expect(decideAutomationStudioAdaptationPromotionGate({
      approvalMode: "auto",
      riskLevel: "low",
      patchKinds: ["edit_expectation"],
      confidence: tierOf([trial()]),
      promoteAdaptations: true
    })).toEqual({
      autoApply: true,
      requiresManualApproval: false,
      reason: "Validated low-risk non-structural adaptation can be applied automatically."
    });
    expect(decideAutomationStudioAdaptationPromotionGate({
      approvalMode: "manual",
      riskLevel: "low",
      patchKinds: ["edit_expectation"],
      confidence: tierOf([trial()]),
      promoteAdaptations: true
    })).toMatchObject({ autoApply: false, requiresManualApproval: true });
    expect(decideAutomationStudioAdaptationPromotionGate({
      approvalMode: "mixed",
      riskLevel: "low",
      patchKinds: ["edit_router"],
      confidence: tierOf([trial()]),
      promoteAdaptations: true
    })).toMatchObject({ autoApply: false, requiresManualApproval: true, reason: "Structural adaptations require manual review before durable promotion." });
    expect(decideAutomationStudioAdaptationPromotionGate({
      approvalMode: "auto",
      riskLevel: "destructive",
      patchKinds: ["edit_action_target"],
      confidence: tierOf([trial()]),
      promoteAdaptations: true
    })).toMatchObject({ autoApply: false, requiresManualApproval: true, reason: "Destructive adaptations always require manual review." });
    expect(decideAutomationStudioAdaptationPromotionGate({
      approvalMode: "auto",
      riskLevel: "low",
      patchKinds: ["edit_expectation"],
      confidence: tierOf([trial()]),
      promoteAdaptations: true,
      requireFirstManualReview: true,
      priorManualReviewExists: false
    })).toMatchObject({ autoApply: false, requiresManualApproval: true, reason: "First automatic promotion is blocked until a manual review has been completed." });
    expect(decideAutomationStudioAdaptationPromotionGate({
      approvalMode: "auto",
      riskLevel: "low",
      patchKinds: ["edit_expectation"],
      confidence: tierOf([trial()]),
      promoteAdaptations: false
    })).toMatchObject({ autoApply: false, requiresManualApproval: false });
  });

  it("promotes an adaptation from the confidence tier its trials and replays earn", () => {
    const gate = (validationResults: AutomationStudioFlowAdaptationValidationResult[], riskLevel: "low" | "medium" = "low") => decideAutomationStudioAdaptationPromotionGate({
      approvalMode: "auto",
      riskLevel,
      patchKinds: ["edit_action_target"],
      confidence: tierOf(validationResults, riskLevel),
      promoteAdaptations: true
    });

    expect(gate([trial()])).toEqual({ autoApply: true, requiresManualApproval: false, reason: "Validated low-risk non-structural adaptation can be applied automatically." });
    expect(gate([trial(), replay(), replay()])).toMatchObject({ autoApply: true });
    expect(gate([legacy("succeeded")])).toMatchObject({ autoApply: true });
    expect(gate([])).toEqual({ autoApply: false, requiresManualApproval: true, reason: "Adaptation must pass validation before promotion." });
    expect(gate([trial("failed")])).toEqual({ autoApply: false, requiresManualApproval: true, reason: "Its latest trial failed, so the change is not promoted until a new trial succeeds." });
    expect(gate([trial(), replay("failed")])).toEqual({ autoApply: false, requiresManualApproval: true, reason: "Its latest replay failed, so the change is not promoted until a new trial succeeds." });
    expect(gate([trial()], "medium")).toMatchObject({ autoApply: false, requiresManualApproval: true, reason: "Only low-risk adaptations can be promoted automatically." });
  });

  it("never promotes a change with no succeeded trial, however many replays it lists", () => {
    const decision = decideAutomationStudioAdaptationPromotionGate({
      approvalMode: "auto",
      riskLevel: "low",
      patchKinds: ["edit_action_target"],
      confidence: tierOf([replay(), replay(), replay()]),
      promoteAdaptations: true
    });
    expect(tierOf([replay(), replay(), replay()]).tier).toBe("established");
    expect(decision).toEqual({ autoApply: false, requiresManualApproval: true, reason: "A change with no succeeded trial is never promoted automatically." });
  });

  it("ignores a fabricated or wrong-kind result when promoting", () => {
    const wrongKind = { ...trial(), kind: "structural_check" } as unknown as AutomationStudioFlowAdaptationValidationResult;
    const unknownStatus = { ...trial(), status: "passed" } as unknown as AutomationStudioFlowAdaptationValidationResult;
    const timeless = { ...trial(), checkedAt: Number.NaN };
    for (const validationResults of [[wrongKind], [unknownStatus], [timeless], [wrongKind, unknownStatus, timeless]]) {
      expect(decideAutomationStudioAdaptationPromotionGate({
        approvalMode: "auto",
        riskLevel: "low",
        patchKinds: ["edit_action_target"],
        confidence: tierOf(validationResults),
        promoteAdaptations: true
      })).toMatchObject({ autoApply: false, requiresManualApproval: true });
    }
  });

  it("refuses a confidence decision that does not hold together", () => {
    const base = { approvalMode: "auto" as const, riskLevel: "low" as const, patchKinds: ["edit_action_target" as const], promoteAdaptations: true };
    const claimed = (confidence: object) => decideAutomationStudioAdaptationPromotionGate({ ...base, confidence: confidence as AutomationStudioChangeConfidenceDecision });
    expect(claimed({ tier: "established", trials: 0, replays: 2, replaysRequired: 2 })).toMatchObject({ autoApply: false, requiresManualApproval: true });
    expect(claimed({ tier: "established", trials: Number.NaN, replays: 2, replaysRequired: 2 })).toMatchObject({ autoApply: false, requiresManualApproval: true });
    expect(claimed({ tier: "trusted", trials: 1, replays: 0, replaysRequired: 2 })).toMatchObject({ autoApply: false, requiresManualApproval: true });
    // @ts-expect-error The retired `validated` claim is no longer an input; an untyped caller still passing it is refused.
    expect(decideAutomationStudioAdaptationPromotionGate({ ...base, validated: true })).toEqual({ autoApply: false, requiresManualApproval: true, reason: "Adaptation must pass validation before promotion." });
  });

  it("decides whether a created Flow may be applied automatically from the same tier rules", () => {
    const gate = (overrides: Partial<AutomationStudioBootstrapApplyGateInput> = {}) => decideAutomationStudioBootstrapApplyGate({
      mode: "create",
      approvalMode: "auto",
      riskLevel: "low",
      confidence: tierOf([trial()]),
      promoteAdaptations: true,
      ...overrides
    });

    expect(gate()).toEqual({ autoApply: true, requiresManualApproval: false, reason: "A created Flow whose trial succeeded, at low risk, can be applied automatically." });
    expect(gate({ confidence: tierOf([trial(), replay(), replay()]) })).toMatchObject({ autoApply: true });
    expect(gate({ confidence: tierOf([]) })).toEqual({ autoApply: false, requiresManualApproval: true, reason: "Adaptation must pass validation before promotion." });
    expect(gate({ confidence: tierOf([replay()]) })).toEqual({ autoApply: false, requiresManualApproval: true, reason: "A change with no succeeded trial is never promoted automatically." });
    expect(gate({ confidence: tierOf([trial(), trial("failed")]) })).toMatchObject({ autoApply: false, requiresManualApproval: true, reason: "Its latest trial failed, so the change is not promoted until a new trial succeeds." });
    expect(gate({ confidence: tierOf([{ ...trial(), kind: "structural_check" } as unknown as AutomationStudioFlowAdaptationValidationResult]) })).toMatchObject({ autoApply: false, requiresManualApproval: true });
    expect(gate({ mode: "extend" })).toEqual({ autoApply: false, requiresManualApproval: true, reason: "Extending an existing Flow is a structural change and requires manual review." });
    expect(gate({ mode: undefined as unknown as "create" })).toMatchObject({ autoApply: false, requiresManualApproval: true });
    expect(gate({ approvalMode: "manual" })).toEqual({ autoApply: false, requiresManualApproval: true, reason: "Manual adaptation approval mode requires explicit review." });
    expect(gate({ approvalMode: "mixed" })).toEqual({ autoApply: false, requiresManualApproval: true, reason: "Only auto approval mode applies a created Flow without review; mixed mode sends a new Subflow to a person." });
    expect(gate({ riskLevel: "medium" })).toEqual({ autoApply: false, requiresManualApproval: true, reason: "Only a low-risk created Flow can be applied automatically." });
    expect(gate({ riskLevel: "high" })).toEqual({ autoApply: false, requiresManualApproval: true, reason: "High-risk adaptations require manual review." });
    expect(gate({ hasExternalSideEffects: true })).toEqual({ autoApply: false, requiresManualApproval: true, reason: "External side effects require manual review before durable promotion." });
    expect(gate({ requireFirstManualReview: true, priorManualReviewExists: false })).toEqual({ autoApply: false, requiresManualApproval: true, reason: "First automatic promotion is blocked until a manual review has been completed." });
    expect(gate({ requireFirstManualReview: true, priorManualReviewExists: true })).toMatchObject({ autoApply: true });
    expect(gate({ promoteAdaptations: false })).toEqual({ autoApply: false, requiresManualApproval: false, reason: "Automatic application of created Flows is disabled by training mode or settings." });
  });

  it("detects frozen flow, route, and subflow scopes", () => {
    const mode = settings({
      frozenScopes: [
        { kind: "flow", flowId: "flow.frozen" },
        { kind: "route", flowId: "flow.checkout", routeRuleId: "rule.vip" },
        { kind: "subflow", flowId: "flow.checkout", subflowId: "subflow.checkout" }
      ]
    });

    expect(automationStudioScopeIsFrozen(mode, { kind: "flow", flowId: "flow.frozen" })).toBe(true);
    expect(automationStudioScopeIsFrozen(mode, { kind: "route", flowId: "flow.checkout", routeRuleId: "rule.vip" })).toBe(true);
    expect(automationStudioScopeIsFrozen(mode, { kind: "subflow", flowId: "flow.checkout", subflowId: "subflow.checkout" })).toBe(true);
    expect(automationStudioScopeIsFrozen(mode, { kind: "route", flowId: "flow.checkout", routeRuleId: "rule.other" })).toBe(false);
  });

  it("annotates run detail and builds training status UI data", () => {
    const mode = settings({ mode: "train_until_stable", frozenScopes: [{ kind: "subflow", flowId: "flow.checkout", subflowId: "subflow.checkout" }] });
    const behavior = behaviorForAutomationStudioTrainingMode(mode, 2, 0.4);
    const detail = annotateRunDetailWithTrainingMode(runDetail(), mode, behavior);
    const status = createAutomationStudioTrainingStatus({
      settings: mode,
      runs: [run({ runId: "run.1", status: "succeeded" })],
      adaptations: [adaptation({ adaptationId: "adaptation.1", status: "validated" })],
      pendingProposalCount: 1,
      uncertainty: [{ scope: "flow", id: "flow.checkout", unresolvedFailures: 0, repeatedTriggerCount: 0, pendingProposalCount: 1, rejectedAdaptationCount: 0, score: 0.1 }]
    });

    expect(detail.metadata).toMatchObject({ trainingMode: "train_until_stable", trainingBehavior: { invokeLlm: true } });
    expect(status).toMatchObject({ mode: "train_until_stable", runsCompleted: 1, learnedChangeCount: 1, pendingProposalCount: 1, frozenScopeCount: 1 });
  });
});

function settings(overrides: Partial<AutomationStudioTrainingModeSettings> = {}): AutomationStudioTrainingModeSettings {
  return {
    mode: "continuous_adaptive",
    allowLlmIntervention: true,
    allowRuntimeRecovery: true,
    allowAdaptationCreation: true,
    proposalApprovalMode: "auto",
    allowPromotion: true,
    ...overrides
  };
}

function run(overrides: Partial<AutomationStudioFlowRunSummary> & { runId: string }): AutomationStudioFlowRunSummary {
  return {
    schemaVersion: "0.1",
    flowId: "flow.checkout",
    projectId: "project.train",
    status: "succeeded",
    updatedAt: 1,
    routeDecisionCount: 0,
    subflowEntryCount: 0,
    actionAttemptCount: 1,
    interventionCount: 0,
    adaptationCount: 0,
    ...overrides
  };
}

function adaptation(overrides: Partial<AutomationStudioTrainingAdaptationSummary> & { adaptationId: string }): AutomationStudioTrainingAdaptationSummary {
  return {
    flowId: "flow.checkout",
    projectId: "project.train",
    status: "validated",
    riskLevel: "low",
    trigger: "ready",
    updatedAt: 1,
    ...overrides
  };
}

function runDetail(): AutomationStudioFlowRunDetail {
  return {
    schemaVersion: "0.1",
    summary: run({ runId: "run.detail" }),
    routeDecisions: [],
    subflows: [],
    interventions: [],
    adaptationIds: [],
    changeProposalIds: []
  };
}
