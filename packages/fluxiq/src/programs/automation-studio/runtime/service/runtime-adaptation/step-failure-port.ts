// The run service's half of re-authoring a Flow whose step failed and that the
// patch ladder could not repair: decide, brief the build, apply, and record.
//
// **Where it is entered.** After the ladder, from the verification
// (`result-verification/run-outcome.ts`), which is where a finished run is
// handed on and where the wrong-answer route's re-run already lives. The run
// reaches it failed, with the ladder's record on it; the decision
// (`recovery/refuted-result/step-failure-decision.ts`) reads that record, and a
// run it does not route is handed back untouched.
//
// **One purse.** The repair of a run spends at most the run cost ceiling in
// total, lowered by the Flow's own setting (`recovery/refuted-result/purse.ts`).
// The ladder was the first part of this repair, so the purse is charged what
// the ladder's gate record says it spent before the build is handed what is
// left. A purse with nothing left starts no build: no model is asked, and the
// attempt is recorded under the cost bound. The purse is written onto the
// run's re-author marker, so a re-run whose answer is then refuted repairs
// from what this left, not from a fresh ceiling.
//
// **A build that builds nothing ends as today.** The failed run stands, with
// the attempt -- its code, its accounting, what the build was told -- recorded
// on the run's re-author marker beside any other.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import {
  automationStudioRefutedResultFlowWasReauthored,
  automationStudioRefutedResultReauthored,
  automationStudioResultRepairPurse,
  automationStudioResultRepairPurseCharged,
  automationStudioResultRepairWithPurse,
  automationStudioStepFailureReauthorBrief,
  automationStudioStepFailureReauthorDecision,
  type AutomationStudioFailedStepRepairPort
} from "../../recovery/refuted-result/index.ts";
import { automationStudioReauthorBuild } from "./reauthor-build.ts";
import type { AutomationStudioRefutedResultRepairPortDependencies } from "./refuted-result-port.ts";

/** What the service lends the port: the same as the wrong-answer route's, less the ladder, which has already run. */
export type AutomationStudioStepFailureRepairPortDependencies = Omit<AutomationStudioRefutedResultRepairPortDependencies, "annotate">;

/** The port the verification calls for a run that failed at a step. */
export function automationStudioStepFailureRepairPort(deps: AutomationStudioStepFailureRepairPortDependencies): AutomationStudioFailedStepRepairPort {
  const now = deps.now ?? Date.now;
  return async (failed) => {
    const flowId = deps.flowId();
    const decision = automationStudioStepFailureReauthorDecision({ detail: failed.detail, ...(deps.projectId ? { projectId: deps.projectId } : {}), ...(flowId ? { flowId } : {}) });
    if (!decision.route) return undefined;
    const opened = automationStudioResultRepairPurseCharged(automationStudioResultRepairPurse(failed.detail, deps.maxCostUsd?.()), ladderSpend(failed.detail));
    const brief = automationStudioStepFailureReauthorBrief({
      projectId: decision.projectId,
      flowId: decision.flowId,
      nodeId: decision.attempt.nodeId,
      detail: failed.detail,
      ...(failed.failedTraceAttempt ? { failedTraceAttempt: failed.failedTraceAttempt } : {}),
      ...(failed.flow ? { flow: failed.flow } : {}),
      ...(failed.deniedEvidenceKeys ? { deniedEvidenceKeys: failed.deniedEvidenceKeys } : {}),
      ladder: decision.record.ladder as JsonObject,
      now: now()
    });
    // What the build was told, as the run keeps it: the failure and the
    // ladder's ending as codes, and how big the brief was. Never its text.
    const briefRecord: JsonObject = { ...decision.record, instructionId: brief.instructionId, chars: brief.body.length };
    const route = { route: true as const, projectId: decision.projectId, flowId: decision.flowId };
    const { detail, purse } = await automationStudioReauthorBuild({
      deps, projectId: decision.projectId, flowId: decision.flowId, brief, purse: opened, detail: failed.detail, now,
      record: (current, built) => automationStudioRefutedResultReauthored({ detail: current, decision: route, ...built, brief: briefRecord })
    });
    return { detail: automationStudioResultRepairWithPurse(detail, purse), reauthored: automationStudioRefutedResultFlowWasReauthored(detail) };
  };
}

/**
 * What the ladder reported spending, read off the gate record it wrote: its
 * ledger's total and call count, and whether it reached a model at all.
 */
function ladderSpend(detail: AutomationStudioFlowRunDetail): { costUsd?: unknown; calls?: unknown; reachedProvider: boolean } {
  const gate = detail.metadata?.llmGate;
  if (!gate || typeof gate !== "object" || Array.isArray(gate)) return { reachedProvider: false };
  const accounting = gate.costAccounting;
  const counted = accounting && typeof accounting === "object" && !Array.isArray(accounting) ? accounting : undefined;
  return { costUsd: counted?.estimatedCostUsd, calls: counted?.calls, reachedProvider: gate.invoked === true };
}
