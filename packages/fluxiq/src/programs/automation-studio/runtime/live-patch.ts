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
  automationStudioChangeValidationResult,
  automationStudioFlowChangeFailureState,
  trialAutomationStudioFlowChange,
  type AutomationStudioChangeVerdict,
  type AutomationStudioChangeVerdictEvidenceKind,
  type AutomationStudioFlowChangeTrialReport
} from "./flow-change/index.ts";
import {
  automationStudioInsertedStepNodeId,
  automationStudioRepairUnitDigest,
  checkAutomationStudioRuntimeTargetOverride,
  overlayAutomationStudioRuntimePatch,
  type AutomationStudioOverlayValidationContext,
  type AutomationStudioRuntimePatchOverlay,
  type AutomationStudioRuntimeTargetOverrideCheck,
  type AutomationStudioRuntimeTargetOverrideEvidenceValidation,
  type AutomationStudioRuntimeTargetOverrideFailedAction
} from "./live-patch/index.ts";
import type { AutomationStudioRuntimePatch, AutomationStudioRuntimePatchUnit, AutomationStudioRuntimeTargetOverrideTarget } from "./llm/index.ts";

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
 *
 * `awaitsJudgedRun` (t267) marks the one `unverifiable` case whose evidence is
 * the judged whole run instead: a target override whose trial's verdict is
 * `no_evidence` -- its changed node succeeded, no check failed or was unknown,
 * the trial named where to carry on, and the Flow declared nothing that could
 * prove it, as a Flow built from an instruction declares nothing. The trial
 * still proved nothing, so nothing is recorded for it here; the run carries on
 * through the change, and the judgement of that whole run is what promotes it
 * or not (`service/runtime-adaptation/judged-promotion.ts`).
 */
export type AutomationStudioRuntimePatchVerification =
  | { status: "verified"; basis: AutomationStudioChangeVerdictEvidenceKind }
  | { status: "unverifiable"; reason: "no_expectation_declared" | "expectation_empty" | "evidence_unevaluated" | "changed_node_incomplete" | "in_run_trial"; awaitsJudgedRun?: true }
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
  /** Whether the run takes the repaired action again: on a `verified` trial, or one that awaits its judged run; never for inserted steps. */
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
  type AutomationStudioRuntimeTargetOverrideControl,
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
  /**
   * The run's permission gate answered for this patch's lasting consequences:
   * it declared none, or the person's permission or instruction allows every one it
   * declared. That is the explicit authorization the policy's two side-effect
   * lines ask for, so neither applies. Only a caller that asked a gate sets it
   * (`recovery/annotation/patches.ts`); every other caller is judged by the
   * policy exactly as before.
   */
  sideEffectPermission?: "permitted";
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
  // The gate, not the policy flag, decided a permitted patch's side effects.
  const policyJudgesSideEffects = sideEffecting && input.sideEffectPermission !== "permitted";
  if (policy && !policy.allowRuntimeRecovery) issues.push("Runtime recovery is disabled by adaptation policy.");
  if (policyJudgesSideEffects && policy && !policy.allowExternalSideEffects) issues.push("External side effects are disabled by adaptation policy.");
  if (policyJudgesSideEffects && policy?.requireApprovalForExternalSideEffects && input.authorizedExternalSideEffects !== true) issues.push("External side-effecting patch requires explicit authorization.");
  if (input.patch.kind === "temporary_recovery_subflow_call" && policy && !policy.allowCreateRecoveryPaths) issues.push("Recovery subflow calls are disabled by adaptation policy.");
  if (input.patch.kind === "temporary_target_override" && policy && !policy.allowModifyActionTargets) issues.push("Action target overrides are disabled by adaptation policy.");
  if (input.patch.kind === "temporary_reroute" && policy && !policy.allowModifyRouter) issues.push("Temporary reroutes are disabled by adaptation policy.");
  if (input.patch.kind === "add_handler" && policy && !policy.allowCreateRecoveryPaths) issues.push("Handlers added by a repair are disabled by adaptation policy.");
  if (input.patch.kind === "replace_unit" && policy && !policy.allowModifySubflows) issues.push("Unit replacements are disabled by adaptation policy.");
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
    requiresExternalSideEffectApproval: policyJudgesSideEffects && policy?.requireApprovalForExternalSideEffects === true
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
  const application = applyRuntimePatchToFlow(input.flow, input.patch, input.runId, input.failedAttempt.nodeId);
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
  const changedNodeId = changedNodeForPatch(input.patch, input.failedAttempt.nodeId, input.runId);
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
  const verification = runtimePatchVerification(trial, input.expectedComparison ?? input.failedAttempt.transitionComparison, input.patch);
  const restoredExpectedState = verification.status === "verified";
  const retryOriginalAction = runtimePatchRetriesOriginalAction(verification, input.patch);
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

/** An in-run repair's patch, checked and overlaid, with the records that keep it until the run's judged end; or why it may not run. */
export type AutomationStudioInRunRepairPreparation =
  | {
    ok: true;
    /** The patch as it runs: a target override carries the domain's resolution in place of the handles. */
    patch: AutomationStudioRuntimePatch;
    overlay: Extract<AutomationStudioRuntimePatchOverlay, { applied: true }>;
    adaptation: AutomationStudioFlowAdaptation;
    changeProposal?: AutomationStudioFlowChangeProposal;
  }
  | { ok: false; code: string; reason: string };

/**
 * One patch of an in-run repair (state-aware recovery plan, C6 step 8): the
 * same preflight a detached repair passes, the one overlay, and the records.
 * There is no trial here: the executor re-attempts the unit on the overlaid
 * graph, and that attempt is the trial. So the adaptation proves nothing yet
 * (`in_run_trial`, awaiting the judged run), and a structural fix links its
 * change proposal, the review record the plan requires.
 */
export function prepareAutomationStudioInRunRepair(input: AutomationStudioRuntimePatchExecutionInput & {
  subflowGraphs?: Readonly<Record<string, AutomationStudioFlowDocument>>;
  validationContext?: AutomationStudioOverlayValidationContext;
}): AutomationStudioInRunRepairPreparation {
  const targetCheck = input.patch.kind === "temporary_target_override" ? checkAutomationStudioRuntimeTargetOverride(input) : undefined;
  const preflight = preflightRuntimePatch(input, targetCheck);
  if (!preflight.ok) return { ok: false, code: "preflight_refused", reason: preflight.issues.join(" ") };
  const checked: AutomationStudioRuntimePatchExecutionInput = targetCheck ? { ...input, patch: targetCheck.patch } : input;
  const overlay = overlayAutomationStudioRuntimePatch({
    flow: checked.flow,
    patch: checked.patch,
    failedNodeId: checked.failedAttempt.nodeId,
    runId: checked.runId,
    ...(input.subflowGraphs ? { subflowGraphs: input.subflowGraphs } : {}),
    ...(input.validationContext ? { validationContext: input.validationContext } : {})
  });
  if (!overlay.applied) return { ok: false, code: overlay.reason, reason: overlay.message };
  const part = checked.patch.kind === "replace_unit" && checked.patch.unit.kind === "part" ? input.subflowGraphs?.[checked.patch.unit.subflowId] : undefined;
  const verification: AutomationStudioRuntimePatchVerification = { status: "unverifiable", reason: "in_run_trial", awaitsJudgedRun: true };
  const recorded = adaptationFromRuntimePatch(checked, undefined, verification);
  // The executor takes the unit again on the overlaid graph; no pass of the
  // detached retry takes the failed action again on this adaptation's account.
  const adaptation: AutomationStudioFlowAdaptation = {
    ...recorded,
    patch: [changePatchFromRuntimePatch(checked.patch, checked.runId, checked.failedAttempt.nodeId, part ?? checked.flow)],
    metadata: { ...(recorded.metadata ?? {}), retryOriginalAction: false, inRunRepair: true }
  };
  if (!requiresChangeProposalForRuntimePatch(checked.patch)) return { ok: true, patch: checked.patch, overlay, adaptation };
  const changeProposal = changeProposalFromRuntimePatch(checked, adaptation);
  return { ok: true, patch: checked.patch, overlay, adaptation: { ...adaptation, proposalId: changeProposal.proposalId }, changeProposal };
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

/**
 * Whether the run takes the repaired action again: after a trial that proved
 * the change, or one whose proof is the judged whole run it carries on into.
 * Never after inserted steps, which ran in the trial and are not taken twice.
 */
function runtimePatchRetriesOriginalAction(verification: AutomationStudioRuntimePatchVerification, patch: AutomationStudioRuntimePatch): boolean {
  const proved = verification.status === "verified" || (verification.status === "unverifiable" && verification.awaitsJudgedRun === true);
  return proved && !patchRunsItsOwnSteps(patch);
}

/**
 * Whether the patch's change is steps of its own: inserted before a node, a
 * handler's body, or a unit's replacement. Those ran in the trial, and the
 * failed action they stand in for or beside is not taken again on their
 * account.
 */
function patchRunsItsOwnSteps(patch: AutomationStudioRuntimePatch): boolean {
  return patch.kind === "temporary_action_sequence" || patch.kind === "add_handler" || patch.kind === "replace_unit";
}

/** The receipt's reading of the verdict. The verdict decided; this only names why. */
function runtimePatchVerification(trial: AutomationStudioFlowChangeTrialReport, comparison: AutomationStudioTransitionComparison | undefined, patch: AutomationStudioRuntimePatch): AutomationStudioRuntimePatchVerification {
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
  // The verdict's `no_evidence` already means everything the marker needs: no
  // check failed or was unknown, a resume point was named, and the changed node
  // succeeded. Only a target override takes it (t267): its trial ran the same
  // action on a new target, which the judged whole run can vouch for.
  const awaitsJudgedRun = patch.kind === "temporary_target_override" && verdict.outcome === "unverifiable" && verdict.notResumableCode === "no_evidence";
  return { status: "unverifiable", reason: comparison ? "expectation_empty" : "no_expectation_declared", ...(awaitsJudgedRun ? { awaitsJudgedRun: true as const } : {}) };
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
  const patch = changePatchFromRuntimePatch(input.patch, input.runId, input.failedAttempt.nodeId);
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
      retryOriginalAction: runtimePatchRetriesOriginalAction(verification, input.patch)
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
  if (verification.status === "unverifiable" && verification.reason === "in_run_trial") return "was overlaid in the run at its failing step and waits for the run's judged end";
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
    patch: [changePatchFromRuntimePatch(input.patch, input.runId, input.failedAttempt.nodeId)],
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

/**
 * Applies a runtime patch to a throwaway copy of the Flow, or says plainly that
 * it could not. There is one application path for every kind, the pure overlay
 * an in-run repair uses too (`./live-patch/overlay.ts`); its switch is the
 * exhaustive one, so a new patch kind fails the type check there until it is
 * applied or explicitly refused.
 */
function applyRuntimePatchToFlow(flow: AutomationStudioFlowDocument, patch: AutomationStudioRuntimePatch, runId: string, failedNodeId: string): { applied: true; flow: AutomationStudioFlowDocument } | { applied: false; reason: string } {
  return overlayAutomationStudioRuntimePatch({ flow, patch, runId, failedNodeId });
}

function changePatchFromRuntimePatch(patch: AutomationStudioRuntimePatch, runId: string, failedNodeId: string, unitGraph?: AutomationStudioFlowDocument): AutomationStudioFlowAdaptation["patch"][number] {
  if (patch.kind === "temporary_reroute") return { kind: "edit_router", targetId: patch.fromNodeId, summary: patch.reason, after: { toNodeId: patch.toNodeId } };
  if (patch.kind === "temporary_target_override") return { kind: "edit_action_target", targetId: patch.targetNodeId, summary: patch.reason, after: patch.target, metadata: { externalSideEffect: true } };
  if (patch.kind === "temporary_recovery_subflow_call") return { kind: "edit_recovery", targetId: patch.subflowId, summary: patch.reason };
  if (patch.kind === "temporary_wait_retry") return { kind: "edit_expectation", targetId: patch.targetNodeId, summary: patch.reason, after: { timeoutMs: patch.timeoutMs ?? null, retryCount: patch.retryCount ?? null } };
  // A handler and a unit replacement keep durable kinds of their own (C12),
  // which the unit repair applier writes through the overlay the run used. A
  // replaced unit carries the digest it was replaced at, so the apply refuses a
  // saved unit that changed since; a new handler names no existing unit.
  if (patch.kind === "add_handler") {
    const { kind: _kind, reason: _reason, metadata: _metadata, consequences: _consequences, ...spec } = patch;
    return { kind: "add_handler", targetId: failedNodeId, summary: patch.reason, after: structuredClone(spec) as unknown as JsonObject, metadata: { runtimePatchKind: patch.kind } };
  }
  if (patch.kind === "replace_unit") {
    const { kind: _kind, reason: _reason, metadata: _metadata, consequences: _consequences, ...spec } = patch;
    const unitDigest = unitGraph ? automationStudioRepairUnitDigest(unitGraph, patch.unit) : undefined;
    return { kind: "replace_unit", targetId: unitTargetId(patch.unit), summary: patch.reason, ...(unitDigest ? { before: { unitDigest } } : {}), after: structuredClone(spec) as unknown as JsonObject, metadata: { runtimePatchKind: patch.kind } };
  }
  // An inserted sequence has no durable form: keeping a step belongs to the
  // extend-mode build plan, which authors it from an exploration rather than
  // from a patch (`live-patch/step-insert.ts`). `edit_recovery` has no durable
  // applier, so a promotion of one is refused rather than half-applied.
  return { kind: "edit_recovery", targetId: patch.targetNodeId, summary: patch.reason };
}

/** The id a unit is named by: its node's, or its Subflow's. */
function unitTargetId(unit: AutomationStudioRuntimePatchUnit): string {
  return unit.kind === "part" ? unit.subflowId : unit.nodeId;
}

function patchMayCauseExternalSideEffects(patch: AutomationStudioRuntimePatch): boolean {
  return patchRunsItsOwnSteps(patch) || patch.kind === "temporary_target_override";
}

function runtimePatchTargetsFlow(flow: AutomationStudioFlowDocument, patch: AutomationStudioRuntimePatch): boolean {
  if (patch.kind === "temporary_recovery_subflow_call") return Boolean(flow.metadata?.subflowIds || patch.subflowId);
  if (patch.kind === "temporary_reroute") return flow.nodes.some((node) => node.id === patch.fromNodeId) && flow.nodes.some((node) => node.id === patch.toNodeId);
  // A handler's nodes must be in this graph; a part is a graph of its own,
  // which only the overlay is handed.
  if (patch.kind === "add_handler") return patch.scope.kind !== "nodes" || patch.scope.nodeIds.every((id) => flow.nodes.some((node) => node.id === id));
  if (patch.kind === "replace_unit") {
    const unit = patch.unit;
    return unit.kind === "part" || flow.nodes.some((node) => node.id === unit.nodeId);
  }
  if ("targetNodeId" in patch) return flow.nodes.some((node) => node.id === patch.targetNodeId);
  return true;
}

/**
 * The node a patch changes, which is also where its trial starts. A reroute
 * changes where the failed node's path leads, so its trial starts at, and is
 * judged by, the node the new route reaches.
 */
function changedNodeForPatch(patch: AutomationStudioRuntimePatch, failedNodeId: string, runId: string): string {
  if (patch.kind === "temporary_reroute") return patch.toNodeId;
  // An insert changes nothing about the node it names: what it changed is the
  // step now running before it, so that is where the trial starts and what the
  // trial judges. Starting at the named node would run the Flow that answered
  // wrongly and record the inserted steps as never reached.
  if (patch.kind === "temporary_action_sequence") return automationStudioInsertedStepNodeId(runId, 0);
  // A replaced node keeps its id, so its first replacement step is where the
  // trial starts. A new handler, a replaced handler and a replaced part change
  // what happens at the step that failed, which is re-attempted there.
  if (patch.kind === "replace_unit" && patch.unit.kind === "node") return patch.unit.nodeId;
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

/**
 * Whether a proven patch is kept as a change proposal: a structural change to
 * a route, a recovery path or a unit, which links to a review record.
 */
function requiresChangeProposalForRuntimePatch(patch: AutomationStudioRuntimePatch): boolean {
  return patch.kind === "temporary_reroute" || patch.kind === "temporary_recovery_subflow_call" || patch.kind === "add_handler" || patch.kind === "replace_unit";
}

function requiredHostCapabilitiesForRuntimePatch(patch: AutomationStudioRuntimePatch): string[] {
  if (patch.kind === "temporary_wait_retry") return ["wait-observe"];
  if (patch.kind === "temporary_target_override" || patch.kind === "temporary_action_sequence") return ["action-dispatch"];
  if (patch.kind === "temporary_recovery_subflow_call") return ["action-dispatch"];
  // Both run steps of their own. The facts a handler's `when` and completion
  // check ask about are read through the host's fact evaluation, which has no
  // capability id of its own yet; the dispatcher that asks it (R2) names it.
  if (patch.kind === "add_handler" || patch.kind === "replace_unit") return ["action-dispatch"];
  return [];
}

function patchRisk(patch: AutomationStudioRuntimePatch): AutomationStudioFlowAdaptation["riskLevel"] {
  if (patchRunsItsOwnSteps(patch) || patch.kind === "temporary_target_override") return "high";
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
