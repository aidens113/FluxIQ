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

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../executor.ts";
import type { AutomationStudioRuntimePatch, AutomationStudioRuntimeTargetOverrideTarget } from "../../llm/index.ts";
import {
  executeAutomationStudioRuntimePatch,
  proposeAutomationStudioRuntimeTargetOverride,
  type AutomationStudioRuntimeTargetOverrideFailedAction
} from "../../live-patch.ts";
import { compactJsonObject, isJsonRecord } from "../../service/index.ts";
import type { AutomationStudioRuntimeAdaptationContext } from "../../service.ts";
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
  for (const patch of input.patches) {
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
      ...(input.failureEvidence && input.ports.llmEvidenceRuntime?.validateTargetOverrideEvidence ? {
        validateTargetOverrideEvidence: (target: AutomationStudioRuntimeTargetOverrideTarget, failedAction: AutomationStudioRuntimeTargetOverrideFailedAction) => {
          try { return input.ports.llmEvidenceRuntime!.validateTargetOverrideEvidence!(input.failureEvidence!, target, failedAction); }
          catch { return { status: "absent" as const }; }
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

/** What, if anything, makes this response wider than the grant that paid for it. */
function explicitProposalIssue(input: AutomationStudioRuntimeRecoveryPatchInput): string | undefined {
  if (!input.explicitProposalGrant) return undefined;
  if (input.patches.length !== 1) return "diagnose_and_adapt requires exactly one runtime patch.";
  if (input.patches[0]?.kind !== "temporary_target_override") return "diagnose_and_adapt supports temporary_target_override proposals only.";
  return undefined;
}
