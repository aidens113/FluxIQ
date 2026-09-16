import type { AutomationStudioFlowAdaptation } from "../../model/index.ts";
import { adaptationRequiresChangeProposal } from "../service/adaptations/index.ts";
import { isJsonRecord } from "../service/json-values.ts";

/**
 * Whether an adaptation may be promoted, and why not when it may not.
 *
 * Every gate here asks for evidence rather than for the absence of an
 * objection: a `validationResults` entry means the adaptation ran and was
 * compared, and a reviewer approval means a named person looked. A `validated`
 * status on its own is a claim about the adaptation and satisfies neither.
 */
export function evaluateFlowAdaptationPromotionGates(adaptation: AutomationStudioFlowAdaptation): { ok: boolean; issues: string[] } {
  const counts = adaptationValidationCounts(adaptation);
  const issues: string[] = [];
  if (counts.succeeded < 1 && !reviewerApprovalForAdaptation(adaptation)) issues.push("at least one successful validation or a named reviewer approval is required");
  if (counts.failed > 0 && counts.succeeded === 0) issues.push("recent failures exist without a successful validation");
  if (adaptation.riskLevel === "destructive") issues.push("destructive adaptations require manual proposal review");
  if (adaptation.status === "disabled") issues.push("disabled adaptations cannot be applied");
  if (adaptation.status === "rejected") issues.push("rejected adaptations cannot be applied");
  if (adaptationRequiresChangeProposal(adaptation) && !adaptation.proposalId) issues.push("structural adaptations require a linked change proposal");
  for (const patch of adaptation.patch) {
    if (patch.kind !== "create_subflow" && !patch.targetId?.trim()) issues.push(`patch ${patch.kind} is missing a target`);
  }
  return { ok: issues.length === 0, issues };
}

/**
 * The named reviewer who approved this adaptation, if one did. It is read from
 * `metadata.review.approvedBy` rather than from the `validated` status, because
 * a status is a claim and not a record that anybody looked.
 */
export function reviewerApprovalForAdaptation(adaptation: AutomationStudioFlowAdaptation): string | undefined {
  const review = isJsonRecord(adaptation.metadata?.review) ? adaptation.metadata.review : undefined;
  const approvedBy = typeof review?.approvedBy === "string" ? review.approvedBy.trim() : "";
  return approvedBy && approvedBy !== "runtime" ? approvedBy : undefined;
}

/** How many executed validations this adaptation carries, by outcome. */
export function adaptationValidationCounts(adaptation: AutomationStudioFlowAdaptation): { succeeded: number; failed: number; total: number } {
  const results = adaptation.validationResults ?? [];
  return {
    succeeded: results.filter((result) => result.status === "succeeded").length,
    failed: results.filter((result) => result.status === "failed").length,
    total: results.length
  };
}

/** Confidence in an adaptation, which is zero while nothing has been executed. */
export function adaptationConfidenceScore(adaptation: AutomationStudioFlowAdaptation): number {
  const counts = adaptationValidationCounts(adaptation);
  if (!counts.total) return 0;
  const riskPenalty = adaptation.riskLevel === "low" ? 0 : adaptation.riskLevel === "medium" ? 0.1 : adaptation.riskLevel === "high" ? 0.25 : 0.5;
  return Math.max(0, Math.min(1, counts.succeeded / counts.total - riskPenalty));
}
