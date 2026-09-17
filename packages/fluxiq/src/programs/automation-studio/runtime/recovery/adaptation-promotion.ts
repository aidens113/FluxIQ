import type { AutomationStudioFlowAdaptation } from "../../model/index.ts";
import type { AutomationStudioBootstrapAdaptation } from "../flow-bootstrap/index.ts";
import type { AutomationStudioChangeConfidenceDecision } from "../flow-change/index.ts";
import { decideAutomationStudioChangeConfidence } from "../flow-change/index.ts";
import { adaptationRequiresChangeProposal, isJsonRecord } from "../service/index.ts";

/**
 * What a change's confidence is read from. A runtime adaptation and a Flow
 * Bootstrap adaptation both qualify.
 */
type AutomationStudioSavedChange = Pick<AutomationStudioFlowAdaptation, "validationResults" | "riskLevel">;

/**
 * Whether an adaptation may be applied, and why not when it may not.
 *
 * Every gate here asks for evidence rather than for the absence of an
 * objection: a succeeded `trial` or `replay` means the adaptation ran and was
 * compared, and a reviewer approval means a named person looked. A `validated`
 * status on its own is a claim about the adaptation and satisfies neither, and
 * a result of any other kind counts for nothing.
 */
export function evaluateFlowAdaptationPromotionGates(adaptation: AutomationStudioFlowAdaptation): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const evidence = applyEvidenceIssue(adaptationConfidence(adaptation), reviewerApprovalForAdaptation(adaptation));
  if (evidence) issues.push(evidence);
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
 * Whether a Flow Bootstrap proposal may be applied, by the same evidence rule
 * as a runtime adaptation: a succeeded trial of the proposed topology (or a
 * replay of it), or a named reviewer's approval. The `validated` status an
 * approval sets is never read; the approval is read from the audit event.
 */
export function evaluateBootstrapAdaptationApplyGates(
  adaptation: Pick<AutomationStudioBootstrapAdaptation, "validationResults" | "riskLevel" | "status" | "auditEvents">
): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const evidence = applyEvidenceIssue(adaptationConfidence(adaptation), reviewerApprovalForBootstrapAdaptation(adaptation));
  if (evidence) issues.push(evidence);
  if (adaptation.status === "rejected") issues.push("rejected adaptations cannot be applied");
  if (adaptation.status === "reverted") issues.push("reverted Flow Bootstrap adaptations cannot be applied again");
  if (adaptation.status === "applied") issues.push("Flow Bootstrap adaptation is already applied");
  return { ok: issues.length === 0, issues };
}

/**
 * The named reviewer who approved this adaptation, if one did. It is read from
 * `metadata.review.approvedBy` rather than from the `validated` status, because
 * a status is a claim and not a record that anybody looked.
 */
export function reviewerApprovalForAdaptation(adaptation: AutomationStudioFlowAdaptation): string | undefined {
  const review = isJsonRecord(adaptation.metadata?.review) ? adaptation.metadata.review : undefined;
  return namedReviewer(review?.approvedBy);
}

/**
 * The confidence tier this change's saved validation results earn. This, not a
 * score, is what promotion reads; the rule itself lives in `flow-change`.
 */
export function adaptationConfidence(adaptation: AutomationStudioSavedChange): AutomationStudioChangeConfidenceDecision {
  return decideAutomationStudioChangeConfidence({ validationResults: adaptation.validationResults ?? [], riskLevel: adaptation.riskLevel });
}

/**
 * How many trials and replays this adaptation carries, by outcome. A result
 * the confidence rule does not count (another kind, an unknown status, no
 * time) is left out, so these counts never disagree with the tier.
 */
export function adaptationValidationCounts(adaptation: AutomationStudioSavedChange): { succeeded: number; failed: number; total: number } {
  let succeeded = 0;
  let failed = 0;
  for (const result of adaptation.validationResults ?? []) {
    const outcome = countedOutcome(result, adaptation.riskLevel);
    if (outcome === "succeeded") succeeded += 1;
    else if (outcome === "failed") failed += 1;
  }
  return { succeeded, failed, total: succeeded + failed };
}

/**
 * A number between 0 and 1 that no gate reads.
 *
 * @deprecated `adaptationConfidence` replaces it. It remains only because
 * `service.ts` still writes it into review metadata; remove it with that write.
 */
export function adaptationConfidenceScore(adaptation: AutomationStudioFlowAdaptation): number {
  const counts = adaptationValidationCounts(adaptation);
  if (!counts.total) return 0;
  const riskPenalty = adaptation.riskLevel === "low" ? 0 : adaptation.riskLevel === "medium" ? 0.1 : adaptation.riskLevel === "high" ? 0.25 : 0.5;
  return Math.max(0, Math.min(1, counts.succeeded / counts.total - riskPenalty));
}

// What a person may apply a change on. A succeeded trial or replay is enough,
// and a named approval stands in for having none. Approval never outvotes a
// failure: an `unverified` tier with a failure on record means the latest
// counted result failed, so the change is contradicted, not merely unproven.
function applyEvidenceIssue(confidence: AutomationStudioChangeConfidenceDecision, approvedBy: string | undefined): string | undefined {
  if (confidence.tier !== "unverified") return undefined;
  if (confidence.lastFailure) return `the latest ${confidence.lastFailure} failed; a succeeded trial or replay is required before it can be applied`;
  return approvedBy ? undefined : "at least one successful trial or replay, or a named reviewer approval, is required";
}

// A bootstrap approval is an `approved` audit event; the latest one names the
// reviewer. Records saved before audit events existed have none.
function reviewerApprovalForBootstrapAdaptation(adaptation: Pick<AutomationStudioBootstrapAdaptation, "auditEvents">): string | undefined {
  const events = adaptation.auditEvents ?? [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.eventType === "approved") return namedReviewer(events[index]?.actorId);
  }
  return undefined;
}

// A reviewer is a person: a non-blank name that is not the runtime acting on
// its own behalf.
function namedReviewer(value: unknown): string | undefined {
  const name = typeof value === "string" ? value.trim() : "";
  return name && name !== "runtime" ? name : undefined;
}

// How the confidence rule counts one result on its own: as a success, as a
// failure, or not at all. Asking the rule, rather than repeating its filter,
// keeps a single definition of what counts.
function countedOutcome(
  result: NonNullable<AutomationStudioSavedChange["validationResults"]>[number],
  riskLevel: AutomationStudioSavedChange["riskLevel"]
): "succeeded" | "failed" | undefined {
  const decision = decideAutomationStudioChangeConfidence({ validationResults: [result], riskLevel });
  if (decision.trials + decision.replays > 0) return "succeeded";
  return decision.lastFailure === undefined ? undefined : "failed";
}
