// The promotion decision for an adaptation a runtime patch saved, mid-run.
//
// It decides and records; it never applies. Where the promotion gate lets the
// adaptation be applied without a person, the decision says so (`autoApply`)
// and holds the apply for the run's judged end: `applyAt: "judged_whole_run"`,
// `applied: false`. The run resumes on the unapplied candidate and the service
// settles the decision once the run's result has been judged
// (`./judged-promotion.ts`). Until 2026-10-02 (t249) this applied the patch to
// the stored Flow here, on the trial alone, before the run had resumed or its
// result had been looked at.
//
// It was a private method of the run service, moved out when it stopped
// applying: the service is at its line ratchet.

import { randomUUID } from "node:crypto";
import type { AutomationStudioFlowAdaptation } from "../../../model/index.ts";
import { adaptationConfidence } from "../../recovery/index.ts";
import { decideAutomationStudioAdaptationPromotionGate } from "../../training-modes.ts";
import { automationStudioFlowPriorManualAdaptationReview, automationStudioVerificationAwaitsJudgedRun, type AutomationStudioPriorManualReviewPorts } from "../adaptations/index.ts";
import { approvalDecisionHistory } from "../adaptation-projections/index.ts";
import { compactJsonObject } from "../compact-json.ts";
import { booleanSetting } from "../flow-settings/index.ts";
import { isJsonRecord } from "../json-values.ts";
import type { AutomationStudioRuntimeAdaptationContext } from "./contracts.ts";
import { AUTOMATION_STUDIO_JUDGED_PROMOTION_APPLY_AT } from "../../durable-behavior/index.ts";

export type AutomationStudioRuntimePromotionPorts = AutomationStudioPriorManualReviewPorts & {
  saveFlowAdaptation(adaptation: AutomationStudioFlowAdaptation): Promise<AutomationStudioFlowAdaptation>;
};

/** Decides whether a runtime adaptation may be applied unattended, records why, and defers any apply to the run's judged end. */
export async function promoteAutomationStudioRuntimeAdaptation(input: {
  ports: AutomationStudioRuntimePromotionPorts;
  adaptation: AutomationStudioFlowAdaptation;
  context: AutomationStudioRuntimeAdaptationContext;
}): Promise<AutomationStudioFlowAdaptation> {
  const now = Date.now();
  const patchKinds = input.adaptation.patch.map((patch) => patch.kind);
  const confidence = adaptationConfidence(input.adaptation);
  const requireFirstManualReview = input.context.settings.requireFirstManualReviewBeforeAutoPromotion === true
    || input.context.policy.preset === "autonomous" && booleanSetting(input.context.settings.metadata?.requireFirstManualReviewBeforeAutoPromotion, false);
  const priorManualReviewExists = requireFirstManualReview
    ? await automationStudioFlowPriorManualAdaptationReview(input.ports, input.adaptation.projectId, input.adaptation.flowId, input.adaptation.adaptationId) === "reviewed"
    : true;
  const hasExternalSideEffects = input.adaptation.patch.some((patch) => isJsonRecord(patch.metadata) && patch.metadata.externalSideEffect === true);
  // A trial that proved nothing either way, whose evidence is the judged whole
  // run this decision already waits for (t267; `../../live-patch.ts`).
  const awaitsJudgedRun = automationStudioVerificationAwaitsJudgedRun(input.adaptation.metadata?.verification);
  const decision = decideAutomationStudioAdaptationPromotionGate({
    approvalMode: input.context.policy.proposalMode,
    riskLevel: input.adaptation.riskLevel,
    patchKinds,
    confidence,
    promoteAdaptations: input.context.behavior.promoteAdaptations,
    requireFirstManualReview,
    priorManualReviewExists,
    hasExternalSideEffects,
    awaitsJudgedRun
  });
  const decisionRecord = compactJsonObject({
    decisionId: `approval.${randomUUID()}`,
    mode: input.context.policy.proposalMode,
    risk: input.adaptation.riskLevel,
    patchKinds,
    validationStatus: confidence.tier === "unverified" ? "unvalidated" : "validated", confidence: confidence.tier,
    reason: decision.reason,
    actor: "runtime",
    decidedAt: now,
    autoApply: decision.autoApply,
    // Allowed unattended, and held until the run that ran it is judged.
    ...(decision.autoApply ? { applyAt: AUTOMATION_STUDIO_JUDGED_PROMOTION_APPLY_AT, applied: false, runId: input.adaptation.sourceRunId } : {}),
    // What that allowance rests on, where it is not a trial: the judged run itself.
    ...(decision.autoApply && awaitsJudgedRun ? { evidence: "judged_whole_run" } : {}),
    requiresManualApproval: decision.requiresManualApproval,
    firstManualReviewRequired: requireFirstManualReview,
    priorManualReviewExists,
    externalSideEffects: hasExternalSideEffects
  });
  return await input.ports.saveFlowAdaptation({
    ...input.adaptation,
    updatedAt: now,
    metadata: {
      ...(input.adaptation.metadata ?? {}),
      approvalDecision: decisionRecord,
      approvalDecisions: [
        ...approvalDecisionHistory(input.adaptation.metadata),
        decisionRecord
      ]
    }
  });
}
