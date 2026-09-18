// Whether a run may carry on after a repair it applied mid-flight, and from
// where. The trial already answered both questions -- `verdict.resumable` is
// the permission and `verdict.resumeFrom` is the place -- and this reads that
// answer back off the run's own patch receipts, which is the only copy the
// retry can see: by the time `runRuntimeSession` reaches the retry, the trial
// is over and its verdict survives only as JSON in run detail metadata.
//
// Everything here fails closed, for the reason `resume.ts` gives: refusing a
// continuation that could have continued costs one recovery pass, while
// continuing past a repair nobody vouched for is the defect this phase exists
// to close. A receipt that says nothing about resuming is therefore refused
// exactly like one that says no.
//
// The second question matters as much as the first. Before this, a retry
// re-ran the whole Flow from its start node, which re-runs every side effect
// the run had already caused before it failed -- an order placed twice, a form
// submitted twice. A repair applied at node five continues at node six.
import type { JsonObject } from "../../../../../core/index.ts";
import { isJsonRecord } from "../json-values.ts";

/**
 * Either the node the run continues at, or the Core code naming why it may
 * not. There is no third answer: a run that asked for a retry either resumes
 * somewhere named or stops with a reason.
 */
export type AutomationStudioAdaptiveRetryDecision =
  | { resume: { nodeId: string; route: string } }
  | { declined: { notResumableCode: string } };

/**
 * The retry decision for one run, from its `runtimePatchAttempts` receipts.
 *
 * `null` means no receipt asked for a retry at all, which is not a refusal:
 * nothing was going to continue, so nothing is reported. A receipt that did
 * ask is then held to its trial's resume decision.
 *
 * `subflowId` is the Subflow graph the retry would re-run, absent when it
 * would re-run the Flow's own graph. A resume point names the graph its node
 * id belongs to, and a node id is unique only inside one graph, so a point
 * naming a different graph -- or naming none while the retry runs a Subflow --
 * is refused rather than aimed at a same-named node of the wrong graph.
 */
export function decideAutomationStudioAdaptiveRetry(input: {
  runtimePatchAttempts: unknown;
  subflowId?: string;
}): AutomationStudioAdaptiveRetryDecision | null {
  const attempts = Array.isArray(input.runtimePatchAttempts) ? input.runtimePatchAttempts.filter(isJsonRecord) : [];
  const asking = attempts.filter((attempt) => attempt.retryOriginalAction === true && isJsonRecord(attempt.approvalDecision) && attempt.approvalDecision.autoApply === true);
  if (!asking.length) return null;
  const points: Array<{ nodeId: string; route: string }> = [];
  for (const attempt of asking) {
    const resolved = resumePointOfAttempt(attempt, input.subflowId);
    if ("declined" in resolved) return resolved;
    points.push(resolved.resume);
  }
  // Two repairs that each vouched for a different continuation leave the run
  // with no single place to go on from, and picking one would be a guess.
  if (points.some((point) => point.nodeId !== points[0]!.nodeId || point.route !== points[0]!.route)) {
    return declined("resume_points_disagree");
  }
  return { resume: points[0]! };
}

/**
 * A copy of the run detail recording that the run stopped rather than continue,
 * and why. Left untouched when nothing was declined, so a run that never asked
 * for a retry still reports no `adaptiveRetry` at all.
 */
export function automationStudioRunDetailWithDeclinedAdaptiveRetry<T extends { metadata?: JsonObject }>(
  detail: T,
  notResumableCode: string | undefined
): T {
  if (notResumableCode === undefined) return detail;
  return { ...detail, metadata: { ...(detail.metadata ?? {}), adaptiveRetry: { attempted: false, notResumableCode } } };
}

function resumePointOfAttempt(attempt: JsonObject, subflowId: string | undefined): AutomationStudioAdaptiveRetryDecision {
  // A receipt with no `resumable` field was written by something that never
  // asked the question. Unknown is not a yes.
  if (attempt.resumable !== true) return declined(typeof attempt.notResumableCode === "string" && attempt.notResumableCode ? attempt.notResumableCode : "resume_decision_missing");
  const point = isJsonRecord(attempt.resumeFrom) ? attempt.resumeFrom : undefined;
  if (!point) return declined("resume_point_missing");
  if (point.subflowId !== subflowId) return declined("resume_point_subflow_mismatch");
  // The trial ran the Flow to its end, so there is no node left to take again.
  // Re-running from the start would repeat every side effect it just caused.
  if (point.completed === true) return declined("resume_point_completed");
  const nodeId = typeof point.nodeId === "string" ? point.nodeId.trim() : "";
  const route = typeof point.route === "string" ? point.route.trim() : "";
  if (!nodeId || !route) return declined("resume_point_malformed");
  return { resume: { nodeId, route } };
}

function declined(notResumableCode: string): AutomationStudioAdaptiveRetryDecision {
  return { declined: { notResumableCode } };
}
