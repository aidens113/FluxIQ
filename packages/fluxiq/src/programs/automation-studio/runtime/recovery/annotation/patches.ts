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

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../executor.ts";
import type {
  AutomationStudioLlmContextPacket,
  AutomationStudioRuntimePatch,
  AutomationStudioRuntimeTargetOverrideTarget
} from "../../llm/index.ts";
import {
  executeAutomationStudioRuntimePatch,
  proposeAutomationStudioRuntimeTargetOverride,
  type AutomationStudioRuntimeTargetOverrideEvidenceValidation,
  type AutomationStudioRuntimeTargetOverrideFailedAction
} from "../../live-patch.ts";
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
    const tested = proposalOnlyTargetOverride
      ? proposeAutomationStudioRuntimeTargetOverride(patchInput)
      : await executeAutomationStudioRuntimePatch(patchInput);
    attempts.push(compactJsonObject({
      kind: patch.kind,
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
    // without Core's qualifier: that is the target to carry.
    return { validation: validation.status === "matched" ? { status: "resolved", target: route.target } : validation, source: "exploration_evidence" };
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


/** What, if anything, makes this response wider than the grant that paid for it. */
function explicitProposalIssue(input: AutomationStudioRuntimeRecoveryPatchInput): string | undefined {
  if (!input.explicitProposalGrant) return undefined;
  if (input.patches.length !== 1) return "diagnose_and_adapt requires exactly one runtime patch.";
  if (input.patches[0]?.kind !== "temporary_target_override") return "diagnose_and_adapt supports temporary_target_override proposals only.";
  return undefined;
}
