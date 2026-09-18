import type { JsonObject } from "../../../core/index.ts";
import {
  parseAutomationStudioFlowChangeOrigin,
  type AutomationStudioAdaptationPolicy,
  type AutomationStudioFlowAdaptation,
  type AutomationStudioFlowAdaptationValidationResult,
  type AutomationStudioFlowChangeOrigin,
  type AutomationStudioFlowChangeProposal,
  type AutomationStudioFlowDocument,
  type AutomationStudioFlowNode
} from "../model/index.ts";
import { classifyAutomationStudioAdaptiveFailure } from "./adaptive-orchestrator.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace, AutomationStudioTransitionComparison } from "./executor.ts";
import {
  AUTOMATION_STUDIO_CHANGE_VERDICT_EVIDENCE_KINDS,
  actionTargetParameterValues,
  automationStudioChangeValidationResult,
  automationStudioFlowChangeFailureState,
  trialAutomationStudioFlowChange,
  type AutomationStudioChangeVerdict,
  type AutomationStudioChangeVerdictEvidenceKind,
  type AutomationStudioFlowChangeTrialReport
} from "./flow-change/index.ts";
import {
  checkAutomationStudioRuntimeTargetOverride,
  type AutomationStudioRuntimeTargetOverrideCheck,
  type AutomationStudioRuntimeTargetOverrideEvidenceValidation,
  type AutomationStudioRuntimeTargetOverrideFailedAction
} from "./live-patch/index.ts";
import type { AutomationStudioRuntimePatch, AutomationStudioRuntimeTargetOverrideTarget } from "./llm/index.ts";

export type AutomationStudioRuntimePatchPreflight = {
  ok: boolean;
  issues: string[];
  requiresExternalSideEffectApproval: boolean;
};

/**
 * What a runtime patch's trial proved, as a receipt reads it: a projection of
 * the trial's flow-change verdict (`result.verdict`), which alone decides it.
 *
 * - `verified`: the verdict's first basis, in its canonical order.
 * - `contradicted`: the codes of the checks that failed, comma-separated.
 * - `unverifiable`: why nothing was proved. A changed node that did not
 *   finish, evidence nobody could evaluate, a comparison that declared
 *   nothing, or no comparison at all. Success is never inferred from the
 *   absence of contradicting evidence, and no validation is recorded.
 * - `not_executed`: why the trial did not run the change.
 */
export type AutomationStudioRuntimePatchVerification =
  | { status: "verified"; basis: AutomationStudioChangeVerdictEvidenceKind }
  | { status: "unverifiable"; reason: "no_expectation_declared" | "expectation_empty" | "evidence_unevaluated" | "changed_node_incomplete" }
  | { status: "contradicted"; reason: string }
  | { status: "not_executed"; reason: string };

export type AutomationStudioRuntimePatchExecutionResult = {
  patch: AutomationStudioRuntimePatch;
  preflight: AutomationStudioRuntimePatchPreflight;
  /** The trial run's saved trace, which withholds what the run resolved out of state. */
  trace?: AutomationStudioGraphExecutionTrace;
  verification?: AutomationStudioRuntimePatchVerification;
  /** The trial's verdict, per changed node, when the trial ran. */
  verdict?: AutomationStudioChangeVerdict;
  /**
   * The trial run as it executed, with real values, for continuing the run from
   * where the trial ended. In memory only: never persisted, published or copied
   * into a receipt.
   */
  executedTrace?: AutomationStudioGraphExecutionTrace;
  /** True only when `verification.status` is `verified`. */
  restoredExpectedState: boolean;
  retryOriginalAction: boolean;
  adaptation?: AutomationStudioFlowAdaptation;
  changeProposal?: AutomationStudioFlowChangeProposal;
  metadata?: JsonObject;
};

// The refusal vocabulary and the contract a domain's target check answers in
// live in `./live-patch/`, beside the check that uses them. They are public
// exactly as they were when they were declared here.
export {
  AUTOMATION_STUDIO_RUNTIME_TARGET_OVERRIDE_REFUSAL_REASONS,
  type AutomationStudioRuntimeTargetOverrideEvidenceValidation,
  type AutomationStudioRuntimeTargetOverrideFailedAction,
  type AutomationStudioRuntimeTargetOverrideRefusal,
  type AutomationStudioRuntimeTargetOverrideRefusalReason
} from "./live-patch/index.ts";

export type AutomationStudioRuntimePatchExecutionInput = {
  projectId: string;
  flowId: string;
  subflowId?: string;
  runId: string;
  flow: AutomationStudioFlowDocument;
  patch: AutomationStudioRuntimePatch;
  /**
   * The attempt that failed, as the run executed it: a rerun is seeded from its
   * `inputs`. A saved trace's copy reads `[withheld]` wherever the run withheld a
   * value, so a rerun seeded from it would execute with the marker.
   */
  failedAttempt: AutomationStudioNodeAttemptTrace;
  expectedComparison?: AutomationStudioTransitionComparison;
  policy?: AutomationStudioAdaptationPolicy;
  proposalMode?: "auto" | "manual" | "mixed";
  authorizedExternalSideEffects?: boolean;
  hostCapabilities?: Iterable<string>;
  /** Domain-owned validation against sanitized evidence, bound to the failed action kind without exposing trace values. */
  validateTargetOverrideEvidence?: (
    target: AutomationStudioRuntimeTargetOverrideTarget,
    failedAction: AutomationStudioRuntimeTargetOverrideFailedAction
  ) => AutomationStudioRuntimeTargetOverrideEvidenceValidation;
  options?: AutomationStudioGraphExecutionOptions;
  /**
   * The steps the run had left when its failed attempt ended, counting that
   * attempt's own step as left, since the trial takes it again. The trial is
   * also the run's continuation, so it is bounded by this and by nothing
   * smaller. Absent, the trial has the run's own step limit, `options.maxSteps`.
   */
  remainingSteps?: number;
  /** Whether a node is a verification step whose later success is evidence for the change. See `trialAutomationStudioFlowChange`. */
  verifiesState?: (node: AutomationStudioFlowNode) => boolean;
  now?: () => number;
};

/**
 * Whether this patch may execute. A target override is judged by the domain's
 * evidence check as well as the policy, exactly as a proposal is
 * (`checkAutomationStudioRuntimeTargetOverride`), and is refused when no check
 * is bound or when the failure is not one a target override could fix.
 */
export function preflightAutomationStudioRuntimePatch(input: AutomationStudioRuntimePatchExecutionInput): AutomationStudioRuntimePatchPreflight {
  return preflightRuntimePatch(input, input.patch.kind === "temporary_target_override" ? checkAutomationStudioRuntimeTargetOverride(input) : undefined);
}

function preflightRuntimePatch(input: AutomationStudioRuntimePatchExecutionInput, targetCheck: AutomationStudioRuntimeTargetOverrideCheck | undefined): AutomationStudioRuntimePatchPreflight {
  const issues: string[] = [];
  const policy = input.policy;
  const sideEffecting = patchMayCauseExternalSideEffects(input.patch);
  if (policy && !policy.allowRuntimeRecovery) issues.push("Runtime recovery is disabled by adaptation policy.");
  if (sideEffecting && policy && !policy.allowExternalSideEffects) issues.push("External side effects are disabled by adaptation policy.");
  if (sideEffecting && policy?.requireApprovalForExternalSideEffects && input.authorizedExternalSideEffects !== true) issues.push("External side-effecting patch requires explicit authorization.");
  if (input.patch.kind === "temporary_recovery_subflow_call" && policy && !policy.allowCreateRecoveryPaths) issues.push("Recovery subflow calls are disabled by adaptation policy.");
  if (input.patch.kind === "temporary_target_override" && policy && !policy.allowModifyActionTargets) issues.push("Action target overrides are disabled by adaptation policy.");
  if (input.patch.kind === "temporary_reroute" && policy && !policy.allowModifyRouter) issues.push("Temporary reroutes are disabled by adaptation policy.");
  const suppliedHostCapabilities = input.hostCapabilities ?? input.options?.hostRuntime?.capabilities;
  if (suppliedHostCapabilities !== undefined) {
    const hostCapabilities = new Set(suppliedHostCapabilities);
    for (const capability of requiredHostCapabilitiesForRuntimePatch(input.patch)) {
      if (!hostCapabilities.has(capability)) issues.push(`Runtime patch requires host capability ${capability}.`);
    }
  }
  // A target override is aimed at the failed node whatever node the model
  // named, so the check, not the model's node, says whether it has one.
  if (targetCheck) issues.push(...targetCheck.issues);
  else if (!runtimePatchTargetsFlow(input.flow, input.patch)) issues.push("Runtime patch points at a node or subflow that is not present in this Flow.");
  return {
    ok: issues.length === 0,
    issues,
    requiresExternalSideEffectApproval: sideEffecting && policy?.requireApprovalForExternalSideEffects === true
  };
}

/**
 * Validates a target override as a durable manual-review proposal without
 * authorizing or executing the proposed target against a host runtime.
 */
export function preflightAutomationStudioRuntimeTargetOverrideProposal(input: AutomationStudioRuntimePatchExecutionInput): AutomationStudioRuntimePatchPreflight {
  return evaluateAutomationStudioRuntimeTargetOverrideProposal(input).preflight;
}

function evaluateAutomationStudioRuntimeTargetOverrideProposal(input: AutomationStudioRuntimePatchExecutionInput): Omit<AutomationStudioRuntimeTargetOverrideCheck, "issues"> & {
  preflight: AutomationStudioRuntimePatchPreflight;
} {
  const issues: string[] = [];
  if (input.patch.kind !== "temporary_target_override") issues.push("Proposal-only runtime patch validation supports target overrides only.");
  if (input.patch.kind === "temporary_target_override" && input.policy && !input.policy.allowModifyActionTargets) issues.push("Action target overrides are disabled by adaptation policy.");
  if (input.patch.kind !== "temporary_target_override" && !runtimePatchTargetsFlow(input.flow, input.patch)) {
    issues.push("Runtime patch points at a node or subflow that is not present in this Flow.");
  }
  const { issues: checkIssues, ...check } = checkAutomationStudioRuntimeTargetOverride(input);
  issues.push(...checkIssues);
  return {
    preflight: { ok: issues.length === 0, issues, requiresExternalSideEffectApproval: true },
    ...check
  };
}

export function proposeAutomationStudioRuntimeTargetOverride(input: AutomationStudioRuntimePatchExecutionInput): AutomationStudioRuntimePatchExecutionResult {
  const evaluated = evaluateAutomationStudioRuntimeTargetOverrideProposal(input);
  const { preflight } = evaluated;
  if (!preflight.ok || input.patch.kind !== "temporary_target_override") {
    return {
      patch: input.patch,
      preflight,
      verification: { status: "not_executed", reason: "preflight_failed" },
      restoredExpectedState: false,
      retryOriginalAction: false,
      // The refusal is kept where a receipt can carry it. Only the target
      // check's refusal is recorded this way: a policy or a missing node is
      // already said, in full, by the issue.
      ...(evaluated.targetRefusal ? { metadata: { proposalOnly: true, executed: false, targetOverrideRefusal: { ...evaluated.targetRefusal } } } : {})
    };
  }
  const resolvedInput = { ...input, patch: evaluated.patch };
  const adaptation = targetOverrideProposalAdaptation(resolvedInput, evaluated.targetResolution, evaluated.targetNodeResolution);
  return {
    patch: evaluated.patch,
    preflight,
    verification: { status: "not_executed", reason: "proposal_only" },
    restoredExpectedState: false,
    retryOriginalAction: false,
    adaptation,
    changeProposal: changeProposalFromRuntimePatch(resolvedInput, adaptation),
    metadata: {
      proposalOnly: true,
      executed: false,
      ...(evaluated.targetResolution ? { targetResolution: evaluated.targetResolution } : {}),
      ...(evaluated.targetNodeResolution ? { targetNodeResolution: evaluated.targetNodeResolution } : {})
    }
  };
}

export async function executeAutomationStudioRuntimePatch(requested: AutomationStudioRuntimePatchExecutionInput): Promise<AutomationStudioRuntimePatchExecutionResult> {
  const targetCheck = requested.patch.kind === "temporary_target_override" ? checkAutomationStudioRuntimeTargetOverride(requested) : undefined;
  const preflight = preflightRuntimePatch(requested, targetCheck);
  if (!preflight.ok) {
    return {
      patch: requested.patch,
      preflight,
      verification: { status: "not_executed", reason: "preflight_failed" },
      restoredExpectedState: false,
      retryOriginalAction: false,
      ...(targetCheck?.targetRefusal ? { metadata: { executed: false, targetOverrideRefusal: { ...targetCheck.targetRefusal } } } : {})
    };
  }
  // What runs, and what the adaptation records, is the checked override: on
  // the failed node, with the domain's resolution in place of the handles.
  const input: AutomationStudioRuntimePatchExecutionInput = targetCheck ? { ...requested, patch: targetCheck.patch } : requested;
  const application = applyRuntimePatchToFlow(input.flow, input.patch, input.runId);
  // Fail closed: a patch kind with no application branch would otherwise send
  // the ORIGINAL flow to the rerun, and that rerun's success would be recorded
  // against a patch that never took effect.
  if (!application.applied) {
    return { patch: input.patch, preflight, verification: { status: "not_executed", reason: application.reason }, restoredExpectedState: false, retryOriginalAction: false };
  }
  const options = trialOptions(input);
  if (!options) {
    return { patch: input.patch, preflight, verification: { status: "not_executed", reason: "no_step_budget_left" }, restoredExpectedState: false, retryOriginalAction: false };
  }
  const changedNodeId = changedNodeForPatch(input.patch, input.failedAttempt.nodeId);
  const origin = runtimePatchOrigin(input);
  const trial = await trialAutomationStudioFlowChange({
    candidate: application.flow,
    changedNodeIds: [changedNodeId],
    startNodeId: changedNodeId,
    seedValues: input.failedAttempt.inputs,
    options,
    failedAttempt: input.failedAttempt,
    ...(origin ? { origin } : {}),
    ...(input.expectedComparison ? { expectedComparison: input.expectedComparison } : {}),
    ...(input.verifiesState ? { verifiesState: input.verifiesState } : {})
  });
  const verification = runtimePatchVerification(trial, input.expectedComparison ?? input.failedAttempt.transitionComparison);
  const restoredExpectedState = verification.status === "verified";
  const retryOriginalAction = restoredExpectedState && input.patch.kind !== "temporary_action_sequence";
  const adaptation = adaptationFromRuntimePatch(input, trial.savedTrace, verification, trial);
  const changeProposal = restoredExpectedState && requiresChangeProposalForRuntimePatch(input.patch)
    ? changeProposalFromRuntimePatch(input, adaptation)
    : undefined;
  return {
    patch: input.patch,
    preflight,
    trace: trial.savedTrace,
    verification,
    verdict: trial.verdict,
    executedTrace: trial.executedTrace,
    restoredExpectedState,
    retryOriginalAction,
    adaptation,
    ...(changeProposal ? { changeProposal } : {})
  };
}

/**
 * The run's own options for the trial, bounded by the steps the run has left
 * when the caller says how many that is. Undefined when none is left: a trial
 * that may take no step runs nothing.
 *
 * The options also name the Subflow being patched, when one is. The verdict's
 * resume point is read off them (`trialAutomationStudioFlowChange`), and a
 * node id is unique only inside the graph that holds it, so without this the
 * trial would hand back a node id belonging to no named graph and a caller
 * resuming on it could aim at a same-named node of the parent Flow.
 */
function trialOptions(input: AutomationStudioRuntimePatchExecutionInput): AutomationStudioGraphExecutionOptions | undefined {
  const options = { ...(input.options ?? {}), ...(input.subflowId ? { currentSubflowId: input.subflowId } : {}) };
  if (input.remainingSteps === undefined) return options;
  const remaining = Math.floor(input.remainingSteps);
  return Number.isFinite(remaining) && remaining >= 1 ? { ...options, maxSteps: remaining } : undefined;
}

/** The receipt's reading of the verdict. The verdict decided; this only names why. */
function runtimePatchVerification(trial: AutomationStudioFlowChangeTrialReport, comparison: AutomationStudioTransitionComparison | undefined): AutomationStudioRuntimePatchVerification {
  const { verdict } = trial;
  const [basis] = verdict.basis;
  if (verdict.outcome === "verified" && basis) return { status: "verified", basis };
  if (verdict.outcome === "contradicted") {
    const codes = verdict.checks.flatMap((check) => (check.status === "failed" && check.code ? [check.code] : []));
    return { status: "contradicted", reason: [...new Set(codes)].join(",") || "trial_contradicted" };
  }
  if (verdict.outcome === "not_executed") return { status: "not_executed", reason: trial.executedTrace.attempts.length ? "changed_nodes_not_reached" : "trial_not_run" };
  if (verdict.checks.some((check) => check.kind === "changed_node_succeeded" && check.status !== "passed")) return { status: "unverifiable", reason: "changed_node_incomplete" };
  const evidenceKinds: readonly string[] = AUTOMATION_STUDIO_CHANGE_VERDICT_EVIDENCE_KINDS;
  if (verdict.checks.some((check) => check.status === "unknown" && evidenceKinds.includes(check.kind))) return { status: "unverifiable", reason: "evidence_unevaluated" };
  return { status: "unverifiable", reason: comparison ? "expectation_empty" : "no_expectation_declared" };
}

/**
 * The adaptation a runtime patch leaves. With its trial, the validation result
 * is the one the trial's verdict earns, and the origin and failure state are
 * the trial's. Without one, only a `verified` or `contradicted` verification
 * records a result: a patch that proved nothing, or never ran, records none
 * and stays in `testing` until something can compare it.
 */
export function adaptationFromRuntimePatch(
  input: AutomationStudioRuntimePatchExecutionInput,
  trace: AutomationStudioGraphExecutionTrace | undefined,
  verification: AutomationStudioRuntimePatchVerification,
  trial?: Pick<AutomationStudioFlowChangeTrialReport, "verdict" | "origin" | "observedState" | "expectedState">
): AutomationStudioFlowAdaptation {
  const now = input.now?.() ?? Date.now();
  const patch = changePatchFromRuntimePatch(input.patch);
  const restoredExpectedState = verification.status === "verified";
  const validationResult = trial
    ? automationStudioChangeValidationResult({ verdict: trial.verdict, runId: input.runId, checkedAt: now, kind: "trial" })
    : validationResultForVerification(input.runId, now, verification, trace);
  const origin = trial ? trial.origin : runtimePatchOrigin(input);
  const failureState = trial ?? automationStudioFlowChangeFailureState(input.failedAttempt, input.expectedComparison ?? input.failedAttempt.transitionComparison);
  return {
    schemaVersion: "0.1",
    adaptationId: `adaptation.${input.runId}.${safePatchSegment(input.patch.kind)}.${now}`,
    flowId: input.flowId,
    projectId: input.projectId,
    ...(input.subflowId ? { subflowId: input.subflowId } : {}),
    sourceRunId: input.runId,
    trigger: `Runtime patch ${input.patch.kind} ${runtimePatchVerificationTrigger(verification)}.`,
    failedAction: {
      attemptId: input.failedAttempt.attemptId,
      nodeId: input.failedAttempt.nodeId,
      definitionId: input.failedAttempt.definitionId,
      status: input.failedAttempt.status,
      route: input.failedAttempt.route ?? ""
    },
    ...(failureState.observedState ? { observedState: failureState.observedState } : {}),
    ...(failureState.expectedState ? { expectedState: failureState.expectedState } : {}),
    diagnosis: input.patch.reason,
    patch: [patch],
    ...(validationResult ? { validationResults: [validationResult] } : {}),
    status: adaptationStatusForVerification(verification),
    author: "runtime",
    riskLevel: patchRisk(input.patch),
    createdAt: now,
    updatedAt: now,
    metadata: {
      runtimePatchKind: input.patch.kind,
      traceStatus: trace?.status ?? "not-run",
      verification: { ...verification },
      ...(trial ? { verdict: structuredClone(trial.verdict) } : {}),
      ...(origin ? { origin: { ...origin } } : {}),
      failureSignature: runtimePatchFailureSignature(input),
      retryOriginalAction: restoredExpectedState && input.patch.kind !== "temporary_action_sequence"
    }
  };
}

function validationResultForVerification(
  runId: string,
  checkedAt: number,
  verification: AutomationStudioRuntimePatchVerification,
  trace: AutomationStudioGraphExecutionTrace | undefined
): AutomationStudioFlowAdaptationValidationResult | undefined {
  const detail = runtimePatchVerificationDetail(verification, trace);
  if (verification.status === "verified") return { runId, status: "succeeded", checkedAt, kind: "trial", basis: [verification.basis], detail };
  if (verification.status === "contradicted") return { runId, status: "failed", checkedAt, kind: "trial", detail };
  return undefined;
}

// Only a contradiction rejects a change. A trial that proved nothing, or never
// reached the change, leaves it in `testing`.
function adaptationStatusForVerification(verification: AutomationStudioRuntimePatchVerification): AutomationStudioFlowAdaptation["status"] {
  if (verification.status === "verified") return "validated";
  if (verification.status === "contradicted") return "rejected";
  return "testing";
}

function runtimePatchVerificationTrigger(verification: AutomationStudioRuntimePatchVerification): string {
  if (verification.status === "verified") return "restored expected state";
  if (verification.status === "unverifiable") return "ran without evidence that proves or contradicts it";
  if (verification.status === "not_executed") return "was not executed";
  return "failed to restore expected state";
}

function runtimePatchVerificationDetail(verification: AutomationStudioRuntimePatchVerification, trace: AutomationStudioGraphExecutionTrace | undefined): string {
  const observed = trace?.message ?? `Runtime patch trace ${trace?.status ?? "not-run"}.`;
  if (verification.status === "verified") return `Observed ${verification.basis}. ${observed}`;
  if (verification.status === "unverifiable") return `Nothing to compare (${verification.reason}). ${observed}`;
  return `${verification.reason}. ${observed}`;
}

function changeProposalFromRuntimePatch(input: AutomationStudioRuntimePatchExecutionInput, adaptation: AutomationStudioFlowAdaptation): AutomationStudioFlowChangeProposal {
  const now = input.now?.() ?? Date.now();
  return {
    schemaVersion: "0.1",
    proposalId: `proposal.${adaptation.adaptationId}`,
    flowId: input.flowId,
    projectId: input.projectId,
    ...(input.subflowId ? { subflowId: input.subflowId } : {}),
    sourceRunId: input.runId,
    sourceAdaptationId: adaptation.adaptationId,
    mode: input.proposalMode ?? "auto",
    status: input.proposalMode === "manual" ? "pending" : "auto_approved",
    riskLevel: adaptation.riskLevel,
    patches: adaptation.patch,
    createdBy: "runtime",
    createdAt: now,
    updatedAt: now,
    metadata: { runtimePatchKind: input.patch.kind }
  };
}

function targetOverrideProposalAdaptation(
  input: AutomationStudioRuntimePatchExecutionInput,
  targetResolution?: "matched" | "resolved",
  targetNodeResolution?: "matched" | "resolved"
): AutomationStudioFlowAdaptation {
  const now = input.now?.() ?? Date.now();
  const origin = runtimePatchOrigin(input);
  const { observedState, expectedState } = automationStudioFlowChangeFailureState(input.failedAttempt, input.expectedComparison ?? input.failedAttempt.transitionComparison);
  return {
    schemaVersion: "0.1",
    adaptationId: `adaptation.${input.runId}.${safePatchSegment(input.patch.kind)}.${now}`,
    flowId: input.flowId,
    projectId: input.projectId,
    ...(input.subflowId ? { subflowId: input.subflowId } : {}),
    sourceRunId: input.runId,
    trigger: "Runtime target override was structurally validated for manual review without execution.",
    failedAction: {
      attemptId: input.failedAttempt.attemptId,
      nodeId: input.failedAttempt.nodeId,
      definitionId: input.failedAttempt.definitionId,
      status: input.failedAttempt.status,
      route: input.failedAttempt.route ?? ""
    },
    observedState,
    ...(expectedState ? { expectedState } : {}),
    diagnosis: input.patch.reason,
    patch: [changePatchFromRuntimePatch(input.patch)],
    // No `validationResults`: this proposal declares `executed: false` in the
    // same object, and a validation entry means "it ran and was compared". The
    // structural check that did happen is recorded where no consumer asking
    // "was this validated?" can mistake it for an executed run.
    status: "proposed",
    author: "runtime",
    riskLevel: "high",
    createdAt: now,
    updatedAt: now,
    metadata: {
      runtimePatchKind: input.patch.kind,
      proposalOnly: true,
      executed: false,
      traceStatus: "not-run",
      verification: { status: "not_executed", reason: "proposal_only" },
      failureSignature: runtimePatchFailureSignature(input),
      ...(origin ? { origin: { ...origin } } : {}),
      structuralChecks: [{ check: "target_resolution", status: "passed", detail: "Target node and selector resolved against this Flow without execution." }],
      retryOriginalAction: false,
      ...(targetResolution ? { targetResolution } : {}),
      ...(targetNodeResolution ? { targetNodeResolution } : {})
    }
  };
}

type AutomationStudioRuntimePatchApplication =
  | { applied: true; flow: AutomationStudioFlowDocument }
  | { applied: false; reason: string };

/**
 * Applies a runtime patch to a throwaway copy of the Flow, or says plainly that
 * it could not. The switch is exhaustive by construction: a new patch kind
 * fails the type check in `unappliedRuntimePatchKind` until it is either
 * applied here or explicitly refused.
 */
function applyRuntimePatchToFlow(flow: AutomationStudioFlowDocument, patch: AutomationStudioRuntimePatch, runId: string): AutomationStudioRuntimePatchApplication {
  const next: AutomationStudioFlowDocument = structuredClone(flow);
  switch (patch.kind) {
    case "temporary_wait_retry": {
      const node = next.nodes.find((candidate) => candidate.id === patch.targetNodeId);
      if (!node) return { applied: false, reason: `target_node_absent:${patch.targetNodeId}` };
      node.parameterValues = { ...(node.parameterValues ?? {}), ...(patch.timeoutMs !== undefined ? { timeoutMs: patch.timeoutMs } : {}), ...(patch.retryCount !== undefined ? { retryCount: patch.retryCount } : {}) };
      return { applied: true, flow: next };
    }
    case "temporary_target_override": {
      const node = next.nodes.find((candidate) => candidate.id === patch.targetNodeId);
      if (!node) return { applied: false, reason: `target_node_absent:${patch.targetNodeId}` };
      // Written where an apply would write it, so the trial runs the repair a
      // recorded step would dispatch, not the target it was recorded with.
      const parameterValues = node.parameterValues ?? {};
      let written: JsonObject;
      try {
        written = actionTargetParameterValues({ nodeId: node.id, definitionId: node.definitionId, parameterValues }, patch.target, `the runtime patch of run ${runId}`);
      } catch {
        return { applied: false, reason: `action_target_unwritable:${node.id}` };
      }
      node.parameterValues = { ...parameterValues, ...written };
      return { applied: true, flow: next };
    }
    case "temporary_reroute": {
      if (!next.nodes.some((node) => node.id === patch.fromNodeId) || !next.nodes.some((node) => node.id === patch.toNodeId)) {
        return { applied: false, reason: `reroute_node_absent:${patch.fromNodeId}->${patch.toNodeId}` };
      }
      if (!next.edges.some((edge) => edge.sourceNodeId === patch.fromNodeId && edge.targetNodeId === patch.toNodeId && edge.sourcePortId === "success")) {
        next.edges.push({ id: `runtime-patch.${patch.fromNodeId}.${patch.toNodeId}`, sourceNodeId: patch.fromNodeId, sourcePortId: "success", targetNodeId: patch.toNodeId, targetPortId: "in" });
      }
      return { applied: true, flow: next };
    }
    // No application exists for these two kinds. Refusing them here is what
    // stops the rerun from validating the unmodified Flow.
    case "temporary_action_sequence":
    case "temporary_recovery_subflow_call":
      return { applied: false, reason: `unapplied_patch_kind:${patch.kind}` };
    default:
      return unappliedRuntimePatchKind(patch);
  }
}

// Compile-time exhaustiveness: a new runtime patch kind fails the type check
// here until it is applied or explicitly refused above.
function unappliedRuntimePatchKind(patch: never): AutomationStudioRuntimePatchApplication {
  return { applied: false, reason: `unapplied_patch_kind:${(patch as { kind?: string }).kind ?? "unknown"}` };
}

function changePatchFromRuntimePatch(patch: AutomationStudioRuntimePatch): AutomationStudioFlowAdaptation["patch"][number] {
  if (patch.kind === "temporary_reroute") return { kind: "edit_router", targetId: patch.fromNodeId, summary: patch.reason, after: { toNodeId: patch.toNodeId } };
  if (patch.kind === "temporary_target_override") return { kind: "edit_action_target", targetId: patch.targetNodeId, summary: patch.reason, after: patch.target, metadata: { externalSideEffect: true } };
  if (patch.kind === "temporary_recovery_subflow_call") return { kind: "edit_recovery", targetId: patch.subflowId, summary: patch.reason };
  if (patch.kind === "temporary_wait_retry") return { kind: "edit_expectation", targetId: patch.targetNodeId, summary: patch.reason, after: { timeoutMs: patch.timeoutMs ?? null, retryCount: patch.retryCount ?? null } };
  return { kind: "edit_recovery", targetId: patch.targetNodeId, summary: patch.reason, after: { actionDefinitionIds: patch.actionDefinitionIds } };
}

function patchMayCauseExternalSideEffects(patch: AutomationStudioRuntimePatch): boolean {
  return patch.kind === "temporary_action_sequence" || patch.kind === "temporary_target_override";
}

function runtimePatchTargetsFlow(flow: AutomationStudioFlowDocument, patch: AutomationStudioRuntimePatch): boolean {
  if (patch.kind === "temporary_recovery_subflow_call") return Boolean(flow.metadata?.subflowIds || patch.subflowId);
  if (patch.kind === "temporary_reroute") return flow.nodes.some((node) => node.id === patch.fromNodeId) && flow.nodes.some((node) => node.id === patch.toNodeId);
  if ("targetNodeId" in patch) return flow.nodes.some((node) => node.id === patch.targetNodeId);
  return true;
}

/**
 * The node a patch changes, which is also where its trial starts. A reroute
 * changes where the failed node's path leads, so its trial starts at, and is
 * judged by, the node the new route reaches.
 */
function changedNodeForPatch(patch: AutomationStudioRuntimePatch, failedNodeId: string): string {
  if (patch.kind === "temporary_reroute") return patch.toNodeId;
  if ("targetNodeId" in patch) return patch.targetNodeId;
  return failedNodeId;
}

/** Where a runtime patch came from: this run's failure. Undefined when an id is not one an origin can hold. */
function runtimePatchOrigin(input: AutomationStudioRuntimePatchExecutionInput): AutomationStudioFlowChangeOrigin | undefined {
  return parseAutomationStudioFlowChangeOrigin({
    entryPoint: "run_failure",
    runId: input.runId,
    failedNodeId: input.failedAttempt.nodeId,
    failureSignature: runtimePatchFailureSignature(input)
  });
}

function requiresChangeProposalForRuntimePatch(patch: AutomationStudioRuntimePatch): boolean {
  return patch.kind === "temporary_reroute" || patch.kind === "temporary_recovery_subflow_call";
}

function requiredHostCapabilitiesForRuntimePatch(patch: AutomationStudioRuntimePatch): string[] {
  if (patch.kind === "temporary_wait_retry") return ["wait-observe"];
  if (patch.kind === "temporary_target_override" || patch.kind === "temporary_action_sequence") return ["action-dispatch"];
  if (patch.kind === "temporary_recovery_subflow_call") return ["action-dispatch"];
  return [];
}

function patchRisk(patch: AutomationStudioRuntimePatch): AutomationStudioFlowAdaptation["riskLevel"] {
  if (patch.kind === "temporary_action_sequence" || patch.kind === "temporary_target_override") return "high";
  if (patch.kind === "temporary_reroute" || patch.kind === "temporary_recovery_subflow_call") return "medium";
  return "low";
}

/**
 * The failure class this adaptation was made for, so a later failure of the
 * same class on another node can still find it. The node-identity clause of
 * `adaptationMatchesFailure` cannot do that, and nothing wrote this field.
 */
function runtimePatchFailureSignature(input: AutomationStudioRuntimePatchExecutionInput): string {
  return classifyAutomationStudioAdaptiveFailure({
    projectId: input.projectId,
    flowId: input.flowId,
    runId: input.runId,
    ...(input.subflowId ? { subflowId: input.subflowId } : {}),
    attempt: input.failedAttempt
  }).signature;
}

function safePatchSegment(value: string): string {
  return value.replace(/[^a-z0-9.-]+/gi, "-").replace(/^-+|-+$/g, "") || "patch";
}
