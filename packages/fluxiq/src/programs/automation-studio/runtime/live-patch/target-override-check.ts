// The one check every runtime target override passes, proposed or executed.
//
// The override is re-aimed at the failed node, which is the node whose action
// the domain is asked about. Core then asks whether a target override could fix
// this failure at all, from its own classification of it; only then is the
// domain asked to judge the target against the evidence the model was shown
// and, where it accepts it, to resolve it into what the node can actually run.
// The model's own handles address nothing. No bound check is a refusal, not a
// pass: an override nobody could judge is exactly the one a domain's refusal
// was meant to stop, and it used to run on the executed path, which never
// asked.

import type { AutomationStudioFlowDocument } from "../../model/index.ts";
import { classifyAutomationStudioAdaptiveFailure } from "../adaptive-orchestrator.ts";
import type { AutomationStudioNodeAttemptTrace } from "../executor.ts";
import { isAutomationStudioRuntimeTargetOverrideTarget, type AutomationStudioRuntimePatch, type AutomationStudioRuntimeTargetOverrideTarget } from "../llm/index.ts";
import { automationStudioRuntimeTargetOverrideFailedAction } from "./failed-action.ts";
import {
  AUTOMATION_STUDIO_RUNTIME_TARGET_OVERRIDE_REFUSAL_REASONS,
  type AutomationStudioRuntimeTargetOverrideControl,
  type AutomationStudioRuntimeTargetOverrideEvidenceValidation,
  type AutomationStudioRuntimeTargetOverrideFailedAction,
  type AutomationStudioRuntimeTargetOverrideRefusal,
  type AutomationStudioRuntimeTargetOverrideRefusalReason
} from "./refusal-reasons.ts";

/** What the check reads of a live patch's input. */
export type AutomationStudioRuntimeTargetOverrideCheckInput = {
  projectId: string;
  flowId: string;
  subflowId?: string;
  runId: string;
  flow: AutomationStudioFlowDocument;
  patch: AutomationStudioRuntimePatch;
  failedAttempt: AutomationStudioNodeAttemptTrace;
  validateTargetOverrideEvidence?: (
    target: AutomationStudioRuntimeTargetOverrideTarget,
    failedAction: AutomationStudioRuntimeTargetOverrideFailedAction
  ) => AutomationStudioRuntimeTargetOverrideEvidenceValidation;
};

export type AutomationStudioRuntimeTargetOverrideCheck = {
  issues: string[];
  /** The override as it may run or be proposed: on the failed node, with the domain's resolution. */
  patch: AutomationStudioRuntimePatch;
  targetResolution?: "matched" | "resolved";
  targetNodeResolution?: "matched" | "resolved";
  targetRefusal?: AutomationStudioRuntimeTargetOverrideRefusal;
  /** What the accepted target names, as the domain described it; absent when it said nothing readable. */
  control?: AutomationStudioRuntimeTargetOverrideControl;
};

/** How long a carried name may be before the domain's word is not carried at all. The gate cuts what it shows far shorter. */
const MAX_CONTROL_NAME = 2_000;
const CONTROL_KIND = /^[a-z][a-z -]{0,31}$/u;

/** Refusal reasons Core gives itself, which read as Core's judgement rather than as the evidence's. */
const CORE_JUDGEMENTS: ReadonlySet<AutomationStudioRuntimeTargetOverrideRefusalReason> = new Set(["failure_not_target_repairable"]);

export function checkAutomationStudioRuntimeTargetOverride(input: AutomationStudioRuntimeTargetOverrideCheckInput): AutomationStudioRuntimeTargetOverrideCheck {
  const issues: string[] = [];
  if (input.patch.kind !== "temporary_target_override") return { issues, patch: input.patch };
  let patch: AutomationStudioRuntimePatch & { kind: "temporary_target_override" } = input.patch;
  let targetNodeResolution: "matched" | "resolved" | undefined;
  if (!input.flow.nodes.some((node) => node.id === input.failedAttempt.nodeId)) {
    issues.push("Failed action node is not present in this Flow.");
  } else if (patch.targetNodeId === input.failedAttempt.nodeId) {
    targetNodeResolution = "matched";
  } else {
    patch = { ...patch, targetNodeId: input.failedAttempt.nodeId };
    targetNodeResolution = "resolved";
  }
  const nodeResolution = targetNodeResolution ? { targetNodeResolution } : {};
  const refused = (targetRefusal: AutomationStudioRuntimeTargetOverrideRefusal): AutomationStudioRuntimeTargetOverrideCheck =>
    ({ issues: [...issues, targetOverrideRefusalIssue(targetRefusal)], patch, ...nodeResolution, targetRefusal });
  // Judged before the domain is asked: the same classification that decided
  // which patch kinds the recovery plan offered, so a failure Core would not
  // offer an override for is not repaired by one the model wrote anyway.
  if (!targetOverrideServesFailure(input)) return refused({ status: "absent", reason: "failure_not_target_repairable" });
  if (!input.validateTargetOverrideEvidence) return refused({ status: "absent", reason: "domain_check_unavailable" });
  const validation = input.validateTargetOverrideEvidence(input.patch.target, automationStudioRuntimeTargetOverrideFailedAction(input.flow, input.failedAttempt));
  const control = carriedControl(validation);
  const described = control ? { control } : {};
  if (validation.status === "matched") return { issues, patch, targetResolution: "matched", ...nodeResolution, ...described };
  if (validation.status !== "resolved") return refused(domainRefusal(validation));
  if (!isAutomationStudioRuntimeTargetOverrideTarget(validation.target)) return { issues: [...issues, "Resolved target override is invalid."], patch, ...nodeResolution };
  // Keeps the failed-node re-aim above, and takes the domain's resolution.
  return { issues, patch: { ...patch, target: validation.target }, targetResolution: "resolved", ...nodeResolution, ...described };
}

/**
 * The domain's description of what an accepted target names, kept only where
 * it is plain: a non-empty bounded name, and a kind in the permission
 * declaration's own vocabulary. Anything else is dropped rather than repaired,
 * and a request then names "a control it cannot name here" -- which asks the
 * person the same question with less said.
 */
function carriedControl(validation: AutomationStudioRuntimeTargetOverrideEvidenceValidation): AutomationStudioRuntimeTargetOverrideControl | undefined {
  if (validation.status !== "matched" && validation.status !== "resolved") return undefined;
  const control: unknown = validation.control;
  if (!control || typeof control !== "object" || Array.isArray(control)) return undefined;
  const { name, kind } = control as { name?: unknown; kind?: unknown };
  if (typeof name !== "string" || !name.trim() || name.length > MAX_CONTROL_NAME) return undefined;
  return typeof kind === "string" && CONTROL_KIND.test(kind) ? { name, kind } : { name };
}

/**
 * Whether Core's own classification of the failure is one it offers a target
 * override for.
 *
 * The candidate kind alone was too narrow, and the narrowing was accidental.
 * `unexpected_state` and `action_failed` are classified
 * `action_target_override` **only inside a Subflow** and
 * `recovery_path_or_reroute` at the top level
 * (`adaptive-orchestrator.ts`), which is a statement about where the node sits
 * rather than about what went wrong: the same action, failing the same way, was
 * repairable by a re-aim in one Flow and refused outright in another. So every
 * override for a top-level `action_failed` -- the commonest live failure there
 * is -- was refused before the domain was asked, with
 * `failure_not_target_repairable`.
 *
 * The two classes are therefore accepted wherever they occur. This widens only
 * who gets *asked*: the domain's own check runs immediately after and refuses
 * an override its evidence does not support, and the policy's
 * `allowModifyActionTargets` still governs whether one may be applied.
 */
const TARGET_REPAIRABLE_ANYWHERE: ReadonlySet<string> = new Set(["unexpected_state", "action_failed"]);

function targetOverrideServesFailure(input: AutomationStudioRuntimeTargetOverrideCheckInput): boolean {
  const failure = classifyAutomationStudioAdaptiveFailure({
    projectId: input.projectId,
    flowId: input.flowId,
    runId: input.runId,
    ...(input.subflowId ? { subflowId: input.subflowId } : {}),
    attempt: input.failedAttempt
  });
  return failure.candidateKind === "action_target_override" || TARGET_REPAIRABLE_ANYWHERE.has(failure.failureClass);
}

/**
 * A domain's refusal, kept to what Core can vouch for. The reason is read from
 * a domain Core does not control, so only one of Core's own words is kept:
 * anything else is dropped rather than repeated into an issue a person reads.
 */
function domainRefusal(validation: { status: "absent" | "ambiguous"; reason?: unknown }): AutomationStudioRuntimeTargetOverrideRefusal {
  const reason = validation.reason;
  return typeof reason === "string" && Object.hasOwn(AUTOMATION_STUDIO_RUNTIME_TARGET_OVERRIDE_REFUSAL_REASONS, reason)
    ? { status: validation.status, reason: reason as AutomationStudioRuntimeTargetOverrideRefusalReason }
    : { status: validation.status };
}

/**
 * The issue a refusal leaves. Its first sentence is the one every reader
 * already matches on; the reason, where there is one, follows it. A refusal
 * Core made from the failure alone says so instead of blaming the evidence,
 * and still names a target override, which is what a reader keys on.
 */
function targetOverrideRefusalIssue(refusal: AutomationStudioRuntimeTargetOverrideRefusal): string {
  const summary = refusal.reason && CORE_JUDGEMENTS.has(refusal.reason)
    ? "Target override cannot repair this failure"
    : refusal.status === "absent"
      ? "Target override is absent from current sanitized evidence"
      : "Target override is ambiguous in current sanitized evidence";
  return refusal.reason
    ? `${summary}: ${AUTOMATION_STUDIO_RUNTIME_TARGET_OVERRIDE_REFUSAL_REASONS[refusal.reason]} (${refusal.reason}).`
    : `${summary}.`;
}
