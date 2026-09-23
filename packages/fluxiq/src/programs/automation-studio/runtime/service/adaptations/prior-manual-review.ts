// Whether a person has ever reviewed one of this Flow's saved changes by hand.
//
// It is read before a change is auto-applied: a Flow somebody has been
// reviewing is a Flow whose next change they expect to review too, and
// auto-applying over that is how a run takes a decision back off them.
//
// It was a private method on `AutomationStudioService`, which is at its own
// line budget and shrinking, and it reaches the service for exactly two reads.
// So it takes them as ports, the way the recovery path and the result
// verification already do, and is testable without a project directory.
//
// **Three answers, not two.** The method this came from answered `false` when
// a read failed, which is the safe answer -- the promotion gate holds an
// auto-apply back on it -- and was indistinguishable from "this Flow has
// genuinely never been reviewed". A store that is down and a Flow nobody has
// touched are different facts, and the caller is entitled to tell them apart
// even while it treats them the same way.

import { isJsonRecord } from "../json-values.ts";
import type { AutomationStudioFlowAdaptation } from "../../../model/index.ts";

export type AutomationStudioPriorManualReviewPorts = {
  listFlowAdaptationSummaries(input: { projectId: string; flowId: string; limit: number; offset: number }): Promise<{ adaptations?: Array<{ adaptationId: string }> }>;
  getFlowAdaptation(projectId: string, flowId: string, adaptationId: string): Promise<AutomationStudioFlowAdaptation | null>;
};

/**
 * What the store could say about prior manual review.
 *
 * `unreadable` is not `never_reviewed`: only `reviewed` permits the promotion
 * gate to treat the first-manual-review requirement as met, so an unreadable
 * store holds the auto-apply back exactly as an unreviewed Flow does -- and
 * says which of the two it was.
 */
export type AutomationStudioPriorManualReviewReading = "reviewed" | "never_reviewed" | "unreadable";

/**
 * Whether some other saved change on this Flow carries a review a person,
 * rather than the runtime, approved or applied.
 */
export async function automationStudioFlowPriorManualAdaptationReview(
  ports: AutomationStudioPriorManualReviewPorts,
  projectId: string,
  flowId: string,
  excludeAdaptationId: string
): Promise<AutomationStudioPriorManualReviewReading> {
  const page = await ports.listFlowAdaptationSummaries({ projectId, flowId, limit: 100, offset: 0 }).catch(() => "unreadable" as const);
  if (page === "unreadable") return "unreadable";
  for (const summary of page.adaptations ?? []) {
    if (summary.adaptationId === excludeAdaptationId) continue;
    const adaptation = await ports.getFlowAdaptation(projectId, flowId, summary.adaptationId).catch(() => "unreadable" as const);
    if (adaptation === "unreadable") return "unreadable";
    const review = isJsonRecord(adaptation?.metadata?.review) ? adaptation.metadata.review : undefined;
    const actorId = typeof review?.actorId === "string" ? review.actorId : "";
    const lastAction = typeof review?.lastAction === "string" ? review.lastAction : "";
    if (actorId && actorId !== "runtime" && actorId !== "system" && (lastAction === "approve" || lastAction === "apply")) return "reviewed";
  }
  return "never_reviewed";
}
