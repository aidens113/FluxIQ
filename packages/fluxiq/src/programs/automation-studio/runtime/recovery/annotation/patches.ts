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
// grant or their instruction, it runs as explicitly authorized. Not allowed, it
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
import { automationStudioExploredEvidenceHandle } from "./exploration.ts";
import type { AutomationStudioRuntimeRecoveryPorts } from "./ports.ts";

export type AutomationStudioRuntimeRecoveryPatchInput = {
  ports: Pick<AutomationStudioRuntimeRecoveryPorts, "llmEvidenceRuntime" | "saveFlowChangeProposal" | "saveFlowAdaptation" | "promoteRuntimeAdaptation">;
  context: AutomationStudioRuntimeAdaptationContext;
  runId: string;
  subflowId?: string;
  flow: AutomationStudioFlowDocument;
  failedAttempt: NonNullable<Parameters<typeof executeAutomationStudioRuntimePatch>[0]["failedAttempt"]>;
  patches: readonly AutomationStudioRuntimePatch[];
  /**
   * Whether this came from a `diagnose_and_adapt` grant, which buys exactly one
   * target override as a proposal and nothing else. A grant is a person saying
   * yes to one specific thing, so anything else the model returned under it is
   * refused with its own recorded reason rather than quietly executed.
   */
  explicitProposalGrant: boolean;
  /**
   * The patch kinds the recovery plan allowed for this failure
   * (`AutomationStudioRuntimeRecoveryPlan.allowedPatchKinds`). Required, and
   * never defaulted: a patch of any other kind is refused before it runs or is
   * proposed. The model is not bound by the plan it was not shown, and under a
   * `diagnose_and_adapt` grant it can only answer with a target override, so a
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
  const grantIssue = explicitProposalIssue(input);
  if (grantIssue) {
    attempts.push(compactJsonObject({
      kind: input.patches.length === 1 ? input.patches[0]?.kind : "runtime_patch_response",
      proposalOnly: true,
      executed: false,
      preflightOk: false,
      restoredExpectedState: false,
      retryOriginalAction: false,
      issues: [grantIssue],
      traceStatus: "not-run"
    }));
    return { attempts, adaptationIds, changeProposalIds };
  }
  const targetCheck = targetOverrideEvidenceCheck(input);
  for (const patch of input.patches) {
    // Only a target override is held to the plan's list. A wait or a reroute
    // the plan did not name costs a rerun and changes nothing durable; a target
    // override presses a control, and the plan's list is the only thing that
    // says the failure is one a control could fix at all.
    if (patch.kind === "temporary_target_override" && !input.allowedPatchKinds.includes(patch.kind)) {
      attempts.push(unplannedPatchAttempt(input, patch));
      continue;
    }
    // Which evidence the accepted target came from, for the receipt. Set only
    // when the domain accepted it.
    let targetEvidence: TargetEvidenceSource | undefined;
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
    const proposalOnlyTargetOverride = input.explicitProposalGrant && patch.kind === "temporary_target_override";
    const permission = input.permissionGate && !proposalOnlyTargetOverride && patch.kind === "temporary_target_override"
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
      if (approvalDecision) attempts[attempts.length - 1] = compactJsonObject({ ...attempts[attempts.length - 1], approvalDecision });
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
 *   asked for, or granted, on a claim nobody made, so it does not run.
 * - `permitted`: it declared nothing lasting, or the person's grant or
 *   instruction allows every class it declared. It runs as authorized.
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

type TargetEvidenceSource = "failure_evidence" | "exploration_evidence";
type TargetEvidenceJudgement = { validation: AutomationStudioRuntimeTargetOverrideEvidenceValidation; source?: TargetEvidenceSource };
type TargetEvidenceCheck = (target: AutomationStudioRuntimeTargetOverrideTarget, failedAction: AutomationStudioRuntimeTargetOverrideFailedAction) => TargetEvidenceJudgement;

/**
 * The target check a patch is judged by, or none when there is nothing to judge
 * it with -- no domain check bound, or no packet at all -- which the live patch
 * refuses as `domain_check_unavailable`.
 *
 * Without an exploration slot this is the check it always was: every handle,
 * as written, against the failure packet. With one, the handles say which
 * packet they came from. A target naming one explored packet is judged against
 * that packet alone, with Core's qualifier removed; one naming none is judged
 * against the failure packet. A target that mixes packets, or names an explored
 * packet the request did not carry, was not shown to the model as one thing
 * and is refused without asking the domain -- so a handle that no packet
 * issued is refused exactly as it was before explored packets existed.
 */
function targetOverrideEvidenceCheck(input: AutomationStudioRuntimeRecoveryPatchInput): TargetEvidenceCheck | undefined {
  const binding = input.ports.llmEvidenceRuntime;
  const validate = binding?.validateTargetOverrideEvidence;
  if (!binding || !validate) return undefined;
  // One question to the domain about one packet. A throw is read as `absent`,
  // as it always was: the domain could not vouch for the target.
  const askDomain = (evidence: JsonObject, target: AutomationStudioRuntimeTargetOverrideTarget, failedAction: AutomationStudioRuntimeTargetOverrideFailedAction): AutomationStudioRuntimeTargetOverrideEvidenceValidation => {
    try {
      return validate.call(binding, evidence, target, failedAction);
    } catch {
      return { status: "absent" };
    }
  };
  const failureEvidence = input.failureEvidence;
  const exploration = input.explorationEvidence;
  if (!exploration) {
    if (!failureEvidence) return undefined;
    return (target, failedAction) => ({ validation: askDomain(failureEvidence, target, failedAction), source: "failure_evidence" });
  }
  const carried = new Map(exploration.packets.map((entry) => [entry.evidenceId, entry.packet] as const));
  return (target, failedAction) => {
    const route = handleRoute(target);
    if (route.kind === "mixed") return { validation: { status: "absent", reason: "handle_not_issued" } };
    if (route.kind === "unqualified") {
      if (!failureEvidence) return { validation: { status: "absent", reason: "domain_check_unavailable" } };
      return { validation: askDomain(failureEvidence, target, failedAction), source: "failure_evidence" };
    }
    const packet = carried.get(route.evidenceId);
    if (!packet) return { validation: { status: "absent", reason: "handle_not_issued" } };
    const validation = askDomain(packet, route.target, failedAction);
    // `matched` means the target stands as the domain was shown it, which is
    // without Core's qualifier: that is the target to carry, with whatever the
    // domain said it names.
    return { validation: validation.status === "matched" ? { status: "resolved", target: route.target, ...(validation.control ? { control: validation.control } : {}) } : validation, source: "exploration_evidence" };
  };
}

/** Which packet every handle of a target came from, and the target as that packet issued it. */
function handleRoute(target: AutomationStudioRuntimeTargetOverrideTarget):
  | { kind: "unqualified" }
  | { kind: "mixed" }
  | { kind: "qualified"; evidenceId: string; target: AutomationStudioRuntimeTargetOverrideTarget } {
  // A target that is not a handle map is the domain's to refuse, as it always was.
  if (!isJsonRecord(target.handles)) return { kind: "unqualified" };
  const read = Object.entries(target.handles).map(([parameter, handle]) => [parameter, typeof handle === "string" ? automationStudioExploredEvidenceHandle(handle) : undefined] as const);
  const qualified = new Set(read.flatMap(([, handle]) => handle?.kind === "qualified" ? [handle.evidenceId] : []));
  if (qualified.size === 0) return { kind: "unqualified" };
  if (qualified.size > 1 || read.some(([, handle]) => handle?.kind !== "qualified")) return { kind: "mixed" };
  const handles = Object.fromEntries(read.map(([parameter, handle]) => [parameter, handle!.handle]));
  return { kind: "qualified", evidenceId: [...qualified][0]!, target: { ...target, handles } };
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
    proposalOnly: input.explicitProposalGrant && targetOverride ? true : undefined,
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

/** What, if anything, makes this response wider than the grant that paid for it. */
function explicitProposalIssue(input: AutomationStudioRuntimeRecoveryPatchInput): string | undefined {
  if (!input.explicitProposalGrant) return undefined;
  if (input.patches.length !== 1) return "diagnose_and_adapt requires exactly one runtime patch.";
  if (input.patches[0]?.kind !== "temporary_target_override") return "diagnose_and_adapt supports temporary_target_override proposals only.";
  return undefined;
}
