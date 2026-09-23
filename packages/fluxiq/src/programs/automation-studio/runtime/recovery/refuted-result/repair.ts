// The failure entry point, entered by a run that succeeded at every step.
//
// This is the wiring the post-mortem's cause 2 is about, and it is deliberately
// thin: it builds the attempt a refuted result amounts to, puts it on the run,
// and hands the run to the recovery the loop already runs for a failed step.
// There is no second diagnosis, no second plan and no second patch path --
// Flow creation, a failed step and a wrong answer are three entry points into
// one improvement loop, and a parallel repair path here would have made them
// three projects.
//
// **The repair is attempted, not filed.** The old behaviour was a receipt: the
// verification wrote `resultVerification` onto the run, the run reported
// `failed`, and nothing read it. This calls the loop. Whether the loop then
// explores, patches, proposes or asks the person for permission is the loop's
// decision, made where every other failure's is made, and a permission request
// it raises is carried out on the run exactly as one raised by a failed step.
//
// **The order matters and it was the other way round.** The service annotated
// the run *before* verifying its result, so at annotation time the run still
// said `succeeded` and the annotation returned at its first line. Verification
// then failed the run with nothing left to act on it. Entering here, from
// inside the verification and after it has written its verdict, is what puts
// the two in the order that lets the verdict reach the planner.
//
// **Once per run, and the run says so.** A repaired run is re-run, and the
// re-run's result is verified in its turn -- it has to be, or a repair that
// produced a second wrong answer would be reported as a success. That closes a
// circle, so the entry point is taken once: the marker below is written onto
// the run detail, the retry carries the pre-retry metadata forward, and a
// second refutation of the same run is recorded and not repaired again. The
// bound is a stated one rather than a budget running out mid-repair.

import type { AutomationStudioFlowDocument, AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../executor.ts";
import type { AutomationStudioResultVerificationOutcome, AutomationStudioRunResultSummary } from "../../result-verification/index.ts";
import { automationStudioRefutedResultAttempt } from "./attempt.ts";

/**
 * The recovery, as the verification reaches it.
 *
 * A port rather than a direct call, for the reason `annotation/ports.ts`
 * states: the recovery needs a provider resolution, a graph binding, an
 * execution grant and an adaptation context, all of which the run service holds
 * and none of which belongs in the verification. It answers the annotated run
 * detail, or nothing when it declined to annotate at all.
 */
export type AutomationStudioRefutedResultRepairPort = (input: {
  /** The run, already carrying the refuted result as a failed attempt. */
  detail: AutomationStudioFlowRunDetail;
  /** The same attempt as the live trace: what the ladder classifies and patches from. */
  failedTraceAttempt: AutomationStudioNodeAttemptTrace;
  /** What the run produced, and the shape of the Flow that produced it. */
  resultSummary: AutomationStudioRunResultSummary;
  flow?: AutomationStudioFlowDocument | undefined;
  subflowId?: string | undefined;
}) => Promise<AutomationStudioFlowRunDetail | undefined>;

export type AutomationStudioRefutedResultRepairInput = {
  runId: string;
  /** The run as the verification just saved it, verdict and all. */
  detail: AutomationStudioFlowRunDetail;
  outcome: AutomationStudioResultVerificationOutcome;
  summary: AutomationStudioRunResultSummary;
  flow?: AutomationStudioFlowDocument | undefined;
  subflowId?: string | undefined;
  now: number;
  repair: AutomationStudioRefutedResultRepairPort;
  saveFlowRunDetail(detail: AutomationStudioFlowRunDetail): Promise<unknown>;
};

/**
 * Takes a run whose result was refuted through the loop's failure entry point,
 * and answers the run as it now stands, or `undefined` when there was nothing
 * to enter with.
 *
 * The attempt is saved whether or not the recovery produced anything. It is the
 * run's own record of what went wrong -- a step that stored the wrong rows,
 * named, with what was expected and what was seen -- and a run that was refused
 * a provider still has to say that, or the next reader is back to reading a
 * `succeeded` node list and a verdict nothing connected.
 */
export async function repairAutomationStudioRefutedRunResult(
  input: AutomationStudioRefutedResultRepairInput
): Promise<AutomationStudioFlowRunDetail | undefined> {
  if (automationStudioRunResultAlreadyRepaired(input.detail)) return undefined;
  const attempt = automationStudioRefutedResultAttempt({ runId: input.runId, detail: input.detail, outcome: input.outcome, now: input.now });
  if (!attempt) return undefined;
  const refuted: AutomationStudioFlowRunDetail = {
    ...input.detail,
    // The status the verification already decided. Stated again because the
    // recovery reads it, and a detail read back mid-write must not be the one
    // thing that stops the repair.
    summary: { ...input.detail.summary, status: "failed" },
    actionAttempts: [...(input.detail.actionAttempts ?? []), attempt.record],
    metadata: {
      ...(input.detail.metadata ?? {}),
      [AUTOMATION_STUDIO_RESULT_REPAIR_METADATA_KEY]: { attempted: true, nodeId: attempt.record.nodeId, code: input.outcome.performed === true ? input.outcome.code : "" }
    }
  };
  const repaired = await input.repair({
    detail: refuted,
    failedTraceAttempt: attempt.trace,
    resultSummary: input.summary,
    ...(input.flow ? { flow: input.flow } : {}),
    ...(input.subflowId ? { subflowId: input.subflowId } : {})
  });
  const saved = repaired ?? refuted;
  await input.saveFlowRunDetail(saved);
  return saved;
}

/** The run's own record that its result was taken through the failure entry point. */
export const AUTOMATION_STUDIO_RESULT_REPAIR_METADATA_KEY = "resultRepair";

/**
 * Whether this run's result has already been repaired once.
 *
 * Read off the run detail rather than held in memory, because the re-run that
 * follows a repair comes back through `runRuntimeSession` as its own pass: the
 * only thing the two passes share is the record. The adaptive retry carries the
 * pre-retry metadata forward, which is what makes the marker outlive the rebuild
 * of the run detail from the retried session's trace.
 */
export function automationStudioRunResultAlreadyRepaired(detail: AutomationStudioFlowRunDetail): boolean {
  const marker = detail.metadata?.[AUTOMATION_STUDIO_RESULT_REPAIR_METADATA_KEY];
  return Boolean(marker) && typeof marker === "object" && !Array.isArray(marker) && (marker as { attempted?: unknown }).attempted === true;
}
