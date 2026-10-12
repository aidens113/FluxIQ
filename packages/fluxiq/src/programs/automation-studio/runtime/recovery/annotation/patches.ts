// Stage D's second half: the patches the model authored, executed or proposed,
// and the receipt each attempt leaves behind.
//
// Nothing here decides *whether* a patch was asked for -- `plan.ts` did that,
// deterministically, before the provider was called a second time. This runs
// what came back, one patch at a time, and records what happened to it in the
// same shape whether it executed, was proposed for review, or was refused by
// the preflight before it touched anything.
//
// The one rule worth stating: an attempt is recorded for every patch, including
// the ones that never ran. A patch the preflight refused used to leave no trace
// at all, so a run that asked for three repairs and got none looked exactly
// like a run that asked for none.
//
// A target override is judged against the evidence the patch request showed
// the model: the failure packet, and the packets the exploration returned. A
// domain numbers its handles per packet, so a handle is only meaningful with
// its packet, and the target check asks the domain about exactly one.
//
// **A repair that would lastingly act asks first.** A target override that
// would run says what pressing its new target would lastingly do
// (`consequences`), and the recovery's one permission gate is asked before it
// runs -- the same gate the exploration answered to. Allowed, by the person's
// permitted consequences or their instruction, it runs as explicitly authorized. Not allowed, it
// becomes the request the recovery ends on, which is what the person answers;
// it is never a preflight refusal nobody is shown. A patch that could not run
// whatever the person said is not asked about, so nobody is asked a question
// whose answer changes nothing.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import {
  automationStudioConsequencesInOrder,
  type AutomationStudioActionConsequence,
  type AutomationStudioActionPermissionGate
} from "../../action-permissions/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../executor.ts";
import {
  AUTOMATION_STUDIO_NO_REPAIR_REASONS,
  type AutomationStudioLlmContextPacket,
  type AutomationStudioNoRepairReason,
  type AutomationStudioRuntimePatch,
  type AutomationStudioRuntimeTargetOverrideTarget
} from "../../llm/index.ts";
import {
  executeAutomationStudioRuntimePatch,
  preflightAutomationStudioRuntimePatch,
  proposeAutomationStudioRuntimeTargetOverride,
  type AutomationStudioRuntimePatchExecutionInput,
  type AutomationStudioRuntimeTargetOverrideEvidenceValidation,
  type AutomationStudioRuntimeTargetOverrideFailedAction
} from "../../live-patch.ts";
import { checkAutomationStudioRuntimeTargetOverride } from "../../live-patch/index.ts";
import { automationStudioRuntimePatchKindPolicyRefusal, type AutomationStudioRuntimePatchKind } from "../plan.ts";
import { compactJsonObject, isJsonRecord } from "../../service/index.ts";
import type { AutomationStudioRuntimeAdaptationContext } from "../../service.ts";
import type { AutomationStudioRuntimeRecoveryPorts } from "./ports.ts";
import { automationStudioRecoveryTargetEvidenceCheck, type AutomationStudioRecoveryTargetEvidenceSource } from "./target-evidence-check.ts";

export type AutomationStudioRuntimeRecoveryPatchInput = {
  ports: Pick<AutomationStudioRuntimeRecoveryPorts, "llmEvidenceRuntime" | "saveFlowChangeProposal" | "saveFlowAdaptation" | "promoteRuntimeAdaptation">;
  context: AutomationStudioRuntimeAdaptationContext;
  runId: string;
  subflowId?: string;
  flow: AutomationStudioFlowDocument;
  failedAttempt: NonNullable<Parameters<typeof executeAutomationStudioRuntimePatch>[0]["failedAttempt"]>;
  patches: readonly AutomationStudioRuntimePatch[];
  /**
   * Whether this came from a `diagnose_and_adapt` run, which asks for exactly
   * one target override as a proposal and nothing else. That run is a person
   * asking for one specific thing, so anything else the model returned in it is
   * refused with its own recorded reason rather than quietly executed.
   */
  explicitProposalRun: boolean;
  /**
   * The patch kinds the recovery plan allowed for this failure
   * (`AutomationStudioRuntimeRecoveryPlan.allowedPatchKinds`). Required, and
   * never defaulted: a patch of any other kind is refused before it runs or is
   * proposed. The model is not bound by the plan it was not shown, and in a
   * `diagnose_and_adapt` run it can only answer with a target override, so a
   * navigation failure's plan -- a reroute or a recovery path -- was answered
   * with one and it was proposed (live repair campaign, 2026-09-17).
   */
  allowedPatchKinds: readonly AutomationStudioRuntimePatchKind[];
  failureEvidence?: JsonObject;
  /**
   * The explored packets exactly as the patch request carried them -- its
   * `context.explorationEvidence`, never the exploration's own list, which may
   * hold packets the request withheld. Absent when the request carried no
   * slot, and then every handle is read against the failure packet as before.
   */
  explorationEvidence?: AutomationStudioLlmContextPacket["explorationEvidence"];
  /** Present exactly when reusable context was consulted, and carries its receipt. */
  reusableContextMetadata?: JsonObject;
  authorizedExternalSideEffects?: boolean;
  /**
   * The recovery's one permission gate (`permissions.ts`). Present, a target
   * override that would run is checked against it before it runs; absent, the
   * policy's side-effect flags judge it exactly as before.
   */
  permissionGate?: AutomationStudioActionPermissionGate;
  graphOptions?: AutomationStudioGraphExecutionOptions;
};

export type AutomationStudioRuntimeRecoveryPatchOutcome = {
  attempts: JsonObject[];
  adaptationIds: string[];
  changeProposalIds: string[];
};

/** Every patch the model returned, run or proposed, with one receipt each. */
export async function applyAutomationStudioRuntimeRecoveryPatches(
  input: AutomationStudioRuntimeRecoveryPatchInput
): Promise<AutomationStudioRuntimeRecoveryPatchOutcome> {
  const attempts: JsonObject[] = [];
  const adaptationIds: string[] = [];
  const changeProposalIds: string[] = [];
  const intentIssue = explicitProposalIssue(input);
  if (intentIssue) {
    attempts.push(compactJsonObject({
      kind: input.patches.length === 1 ? input.patches[0]?.kind : "runtime_patch_response",
      proposalOnly: true,
      executed: false,
      preflightOk: false,
      restoredExpectedState: false,
      retryOriginalAction: false,
      issues: [intentIssue],
      traceStatus: "not-run"
    }));
    return { attempts, adaptationIds, changeProposalIds };
  }
  const targetCheck = automationStudioRecoveryTargetEvidenceCheck(input);
  for (const patch of input.patches) {
    // Only a patch that acts is held to the plan's list. A wait or a reroute
    // the plan did not name costs a rerun and changes nothing durable; a target
    // override presses a control and an inserted step runs one, and the plan's
    // list is the only thing that says the failure is one either could fix at
    // all. A new handler and a replaced unit run steps of their own, and only
    // a plan for an in-run repair lists them.
    if ((patch.kind === "temporary_target_override" || patch.kind === "temporary_action_sequence" || patch.kind === "add_handler" || patch.kind === "replace_unit") && !input.allowedPatchKinds.includes(patch.kind)) {
      attempts.push(unplannedPatchAttempt(input, patch));
      continue;
    }
    // Which evidence the accepted target came from, for the receipt. Set only
    // when the domain accepted it.
    let targetEvidence: AutomationStudioRecoveryTargetEvidenceSource | undefined;
    const patchInput = {
      projectId: input.context.projectId,
      flowId: input.context.flowId,
      ...(input.subflowId ? { subflowId: input.subflowId } : {}),
      runId: input.runId,
      flow: input.flow,
      patch,
      failedAttempt: input.failedAttempt,
      ...(input.failedAttempt.transitionComparison ? { expectedComparison: input.failedAttempt.transitionComparison } : {}),
      policy: input.context.policy,
      proposalMode: input.context.policy.proposalMode,
      ...(targetCheck ? {
        validateTargetOverrideEvidence: (target: AutomationStudioRuntimeTargetOverrideTarget, failedAction: AutomationStudioRuntimeTargetOverrideFailedAction) => {
          const judged = targetCheck(target, failedAction);
          targetEvidence = judged.validation.status === "matched" || judged.validation.status === "resolved" ? judged.source : undefined;
          return judged.validation;
        }
      } : {}),
      ...(input.authorizedExternalSideEffects !== undefined ? { authorizedExternalSideEffects: input.authorizedExternalSideEffects } : {}),
      ...(input.graphOptions ? { options: input.graphOptions } : {})
    };
    const proposalOnlyTargetOverride = input.explicitProposalRun && patch.kind === "temporary_target_override";
    // Both kinds that act answer to the gate. An inserted step runs a control
    // the Flow never had, which is at least as consequential as re-pointing one
    // it already had, so a step that would lastingly act is the person's
    // question, never a refusal the run swallows.
    const acting = patch.kind === "temporary_target_override" || patch.kind === "temporary_action_sequence";
    const permission = input.permissionGate && !proposalOnlyTargetOverride && acting
      ? await patchPermission(input.permissionGate, patchInput, input.failedAttempt)
      : undefined;
    if (permission?.outcome === "required" || permission?.outcome === "undeclared") {
      attempts.push(heldPatchAttempt(patch.kind, permission));
      // As on the authoring path, the first request ends the recovery: a later
      // patch built beside one the person has not yet allowed would be a guess.
      if (permission.outcome === "required") break;
      continue;
    }
    const tested = proposalOnlyTargetOverride
      ? proposeAutomationStudioRuntimeTargetOverride(patchInput)
      : await executeAutomationStudioRuntimePatch(permission?.outcome === "permitted" ? { ...patchInput, sideEffectPermission: "permitted" } : patchInput);
    attempts.push(compactJsonObject({
      kind: patch.kind,
      // What the gate said, where it was asked: `permitted` (nothing declared,
      // or all of it allowed) or `not_asked` (the patch could not have run).
      permissionOutcome: permission?.outcome,
      consequences: permission?.outcome === "permitted" ? permission.declared : undefined,
      proposalOnly: tested.metadata?.proposalOnly,
      executed: tested.metadata?.executed,
      targetResolution: tested.metadata?.targetResolution,
      targetNodeResolution: tested.metadata?.targetNodeResolution,
      // `failure_evidence` or `exploration_evidence`: whether the repair names a
      // control only the exploration revealed. A label, never the packet.
      targetEvidence,
      preflightOk: tested.preflight.ok,
      // Why the domain refused the target, in Core's own words, so a reader
      // can tell an action the domain cannot repair from a handle the model
      // invented without parsing the issue text.
      targetOverrideRefusal: tested.metadata?.targetOverrideRefusal,
      verification: tested.verification,
      restoredExpectedState: tested.restoredExpectedState,
      retryOriginalAction: tested.retryOriginalAction,
      // The trial's own answer to whether the run may carry on, and from where.
      // The retry is the only caller, it runs long after the trial is over, and
      // this receipt is the only copy of the verdict it can still see.
      resumable: tested.verdict?.resumable,
      notResumableCode: tested.verdict?.notResumableCode,
      resumeFrom: tested.verdict?.resumeFrom,
      issues: tested.preflight.issues,
      traceStatus: tested.trace?.status ?? "not-run",
      adaptationId: tested.adaptation?.adaptationId,
      changeProposalId: tested.changeProposal?.proposalId
    }));
    if (tested.changeProposal) {
      await input.ports.saveFlowChangeProposal(tested.changeProposal);
      changeProposalIds.push(tested.changeProposal.proposalId);
    }
    if (tested.adaptation) {
      const adaptationBase = tested.changeProposal ? { ...tested.adaptation, proposalId: tested.changeProposal.proposalId } : tested.adaptation;
      const adaptation = input.reusableContextMetadata
        ? { ...adaptationBase, metadata: { ...(adaptationBase.metadata ?? {}), reusableContext: input.reusableContextMetadata } }
        : adaptationBase;
      const savedAdaptation = await input.ports.saveFlowAdaptation(adaptation);
      const promoted = await input.ports.promoteRuntimeAdaptation({ adaptation: savedAdaptation, context: input.context });
      const approvalDecision = isJsonRecord(promoted.metadata?.approvalDecision) ? promoted.metadata.approvalDecision : undefined;
      // A trial that ran the Flow to its end, on a patch allowed unattended, is
      // the run's resumed pass (t249): its saved trace rides on the receipt
      // until the re-run step adopts it, since nothing runs again to replace it.
      const completed = tested.verdict?.resumeFrom && "completed" in tested.verdict.resumeFrom && approvalDecision?.autoApply === true && tested.trace;
      if (approvalDecision) attempts[attempts.length - 1] = compactJsonObject({ ...attempts[attempts.length - 1], approvalDecision, ...(completed ? { completedTrace: tested.trace as unknown as JsonObject } : {}) });
      adaptationIds.push(promoted.adaptationId);
    }
  }
  return { attempts, adaptationIds, changeProposalIds };
}

/**
 * What the gate said about one target override that would run.
 *
 * - `not_asked`: it could not have run whatever the person said -- the
 *   domain refused its target, or a policy or host check would refuse it -- so
 *   it runs into that refusal as before and nobody is asked.
 * - `undeclared`: it did not say what it would lastingly do. Nothing can be
 *   asked for, or permitted, on a claim nobody made, so it does not run.
 * - `permitted`: it declared nothing lasting, or the person's permitted
 *   consequences or instruction allow every class it declared. It runs as authorized.
 * - `required`: it declared a class nobody allowed. The gate raised the
 *   request the recovery ends on.
 */
type PatchPermission =
  | { outcome: "not_asked" }
  | { outcome: "undeclared" }
  | { outcome: "permitted"; declared: AutomationStudioActionConsequence[] }
  | {
    outcome: "required";
    declared: AutomationStudioActionConsequence[];
    missing: AutomationStudioActionConsequence[];
    requestId: string | null;
    sentence: string;
    targetResolution?: "matched" | "resolved" | undefined;
    targetNodeResolution?: "matched" | "resolved" | undefined;
  };

/** Names the step's target when the domain described nothing a request could carry; the gate then says "a control it cannot name here". */
const UNNAMED_TARGET = "the step's new target";

async function patchPermission(
  gate: AutomationStudioActionPermissionGate,
  patchInput: AutomationStudioRuntimePatchExecutionInput,
  failedAttempt: AutomationStudioRuntimeRecoveryPatchInput["failedAttempt"]
): Promise<PatchPermission> {
  // Every check but the side-effect one, as though the gate had said yes. A
  // patch that fails one of them is refused whatever the person says.
  if (!preflightAutomationStudioRuntimePatch({ ...patchInput, sideEffectPermission: "permitted" }).ok) return { outcome: "not_asked" };
  const patch = patchInput.patch;
  const declaredValue = patch.kind === "temporary_target_override" || patch.kind === "temporary_action_sequence" ? patch.consequences : undefined;
  if (declaredValue === undefined) return { outcome: "undeclared" };
  const declared = automationStudioConsequencesInOrder(declaredValue);
  if (!declared.length) return { outcome: "permitted", declared };
  // Asked again only to learn what the accepted target names: the same pure
  // check the preflight just passed.
  const check = checkAutomationStudioRuntimeTargetOverride(patchInput);
  const verdict = await gate.checkFor({ kind: "flow_step", id: failedAttempt.definitionId, ref: failedAttempt.nodeId })({
    consequences: declared,
    control: check.control ?? { name: UNNAMED_TARGET },
    verb: "press"
  });
  if (verdict.permitted) return { outcome: "permitted", declared };
  return {
    outcome: "required",
    declared,
    missing: [...verdict.missing],
    requestId: verdict.requestId,
    sentence: gate.request?.sentence ?? "The repair needs a permission the run does not hold.",
    targetResolution: check.targetResolution,
    targetNodeResolution: check.targetNodeResolution
  };
}

/** The receipt of a target override the gate held back: the question the person is asked, or the declaration it lacked. */
function heldPatchAttempt(kind: AutomationStudioRuntimePatch["kind"], permission: Extract<PatchPermission, { outcome: "required" | "undeclared" }>): JsonObject {
  const required = permission.outcome === "required" ? permission : undefined;
  return compactJsonObject({
    kind,
    executed: false,
    preflightOk: false,
    permissionOutcome: permission.outcome,
    permissionRequired: required ? true : undefined,
    requestId: required?.requestId ?? undefined,
    consequences: required?.declared,
    missing: required?.missing,
    targetResolution: required?.targetResolution,
    targetNodeResolution: required?.targetNodeResolution,
    verification: { status: "not_executed", reason: required ? "permission_required" : "consequences_undeclared" },
    restoredExpectedState: false,
    retryOriginalAction: false,
    issues: [required
      ? `Permission required: ${required.sentence}`
      : "The repair did not say what it would lastingly do, so it was not run: nobody can be asked to allow a consequence nobody declared."],
    traceStatus: "not-run"
  });
}

/**
 * The receipt a declined repair leaves: the model was asked, looked, and
 * answered that there is nothing to repair. It is recorded as an attempt so a
 * run that declined does not read like a run that was never asked, and it is
 * never a proposal: nothing was changed and nothing is waiting for approval.
 */
export function automationStudioDeclinedRepairAttempt(reason: AutomationStudioNoRepairReason): JsonObject {
  return compactJsonObject({
    kind: "no_repair",
    executed: false,
    preflightOk: false,
    declinedReason: reason,
    verification: { status: "not_executed", reason: "declined" },
    restoredExpectedState: false,
    retryOriginalAction: false,
    issues: [`The model was asked for a repair and declined: ${AUTOMATION_STUDIO_NO_REPAIR_REASONS[reason]} (${reason}).`],
    traceStatus: "not-run"
  });
}

/**
 * The receipt of a patch whose kind the plan left out. The policy's own
 * sentence where the policy was the reason; otherwise the failure was, and a
 * target override carries the same refusal Core's check gives it, so a reader
 * keyed on `targetOverrideRefusal` sees why.
 */
function unplannedPatchAttempt(input: AutomationStudioRuntimeRecoveryPatchInput, patch: AutomationStudioRuntimePatch): JsonObject {
  const policyRefusal = automationStudioRuntimePatchKindPolicyRefusal(patch.kind, input.context.policy);
  const targetOverride = patch.kind === "temporary_target_override";
  return compactJsonObject({
    kind: patch.kind,
    proposalOnly: input.explicitProposalRun && targetOverride ? true : undefined,
    executed: false,
    preflightOk: false,
    targetOverrideRefusal: targetOverride && !policyRefusal ? { status: "absent", reason: "failure_not_target_repairable" } : undefined,
    verification: { status: "not_executed", reason: "not_planned" },
    restoredExpectedState: false,
    retryOriginalAction: false,
    issues: [policyRefusal ?? `The recovery plan allows no ${patch.kind.replace(/^temporary_/u, "").replace(/_/gu, " ")} for this failure.`],
    traceStatus: "not-run"
  });
}

/** What, if anything, makes this response wider than the `diagnose_and_adapt` run asked for. */
function explicitProposalIssue(input: AutomationStudioRuntimeRecoveryPatchInput): string | undefined {
  if (!input.explicitProposalRun) return undefined;
  if (input.patches.length !== 1) return "diagnose_and_adapt requires exactly one runtime patch.";
  if (input.patches[0]?.kind !== "temporary_target_override") return "diagnose_and_adapt supports temporary_target_override proposals only.";
  return undefined;
}
