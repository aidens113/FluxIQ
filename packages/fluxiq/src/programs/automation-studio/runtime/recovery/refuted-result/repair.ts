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
// **Bounded, and each attempt sees the ones before it.** A repaired run is
// re-run, and the re-run's result is verified in its turn -- it has to be, or a
// repair that produced a second wrong answer would be reported as a success.
// Until `run-mulwm2dc-0bd95f22` that circle was closed after one turn: the
// second refutation of a run was recorded and never repaired, so a repair that
// missed once had missed for good. It now turns up to
// `AUTOMATION_STUDIO_RESULT_REPAIR_MAX_ATTEMPTS` times, stops early when the
// answer stops changing (`history.ts`), and hands every attempt the refutations
// before it. The count lives on the run's own marker, which the re-run carries
// forward (`service/runtime-adaptation/repair-rerun.ts`), so the bound holds
// however the passes are driven.
//
// **The run says what the repair is doing while it does it.** A re-author is a
// whole build and can take minutes, during which the run reads `failed` with no
// recovery record -- which a reader waiting for one could only guess about. So
// the marker carries a `phase`: `reauthoring` before the build starts,
// `rerunning` once an applied edit is about to be run, and `settled` with the
// outcome when nothing more will happen. A reader follows the phase instead of
// a fixed guess at how long a repair takes.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../../executor.ts";
import type { AutomationStudioResultVerificationOutcome, AutomationStudioRunResultSummary } from "../../result-verification/index.ts";
import { automationStudioRefutedResultAttempt } from "./attempt.ts";
import {
  AUTOMATION_STUDIO_RESULT_REPAIR_MAX_ATTEMPTS,
  AUTOMATION_STUDIO_RESULT_REPAIR_METADATA_KEY,
  automationStudioResultRepairContinuation,
  automationStudioResultRepairHistoryEntry,
  automationStudioResultRepairHistoryRecord,
  type AutomationStudioResultRepairHistoryEntry,
  type AutomationStudioResultRepairStop
} from "./history.ts";
import { automationStudioRefutedResultFlowWasReauthored, automationStudioRefutedResultReplayReady } from "./reauthor.ts";

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
  /** The refutation this repair answers, as the repair build is told it (`brief.ts`). */
  current: AutomationStudioResultRepairHistoryEntry;
  /** Every earlier refutation of this run, oldest first: what each repaired version produced, and why it was refuted. */
  history: readonly AutomationStudioResultRepairHistoryEntry[];
  maxAttempts: number;
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
  /** The refutations earlier passes of this verification met, oldest first. Empty on the first. */
  history?: readonly AutomationStudioResultRepairHistoryEntry[] | undefined;
  /** Whether a re-run follows an applied edit here, so the phase written says so. */
  willRerun?: boolean | undefined;
  maxAttempts?: number | undefined;
};

/** What the entry point did with one refutation. */
export type AutomationStudioRefutedResultRepairResult = {
  /** The run as it now stands, saved. */
  detail: AutomationStudioFlowRunDetail;
  /** This refutation, as the next attempt will be shown it. */
  entry: AutomationStudioResultRepairHistoryEntry;
  /** Present when this refutation was not repaired, and why. */
  stopped?: AutomationStudioResultRepairStop;
};

/**
 * Takes a run whose result was refuted through the loop's failure entry point,
 * and answers what became of it, or `undefined` when there was nothing to
 * enter with.
 *
 * The attempt is saved whether or not the recovery produced anything. It is the
 * run's own record of what went wrong -- a step that stored the wrong rows,
 * named, with what was expected and what was seen -- and a run that was refused
 * a provider still has to say that, or the next reader is back to reading a
 * `succeeded` node list and a verdict nothing connected.
 */
export async function repairAutomationStudioRefutedRunResult(
  input: AutomationStudioRefutedResultRepairInput
): Promise<AutomationStudioRefutedResultRepairResult | undefined> {
  const maxAttempts = input.maxAttempts ?? AUTOMATION_STUDIO_RESULT_REPAIR_MAX_ATTEMPTS;
  const history = input.history ?? [];
  const made = automationStudioRunResultRepairAttempts(input.detail);
  const attemptNumber = made + 1;
  const attempt = automationStudioRefutedResultAttempt({ runId: input.runId, detail: input.detail, outcome: input.outcome, now: input.now, attempt: attemptNumber });
  if (!attempt) return undefined;
  const entry = automationStudioResultRepairHistoryEntry({ attempt: attemptNumber, outcome: input.outcome, summary: input.summary, nodeId: attempt.record.nodeId });
  const records = [...recordedHistory(input.detail), automationStudioResultRepairHistoryRecord(entry)];
  const code = input.outcome.performed === true ? input.outcome.code : "";
  const continuation = automationStudioResultRepairContinuation({ history, current: entry, maxAttempts });
  if (!continuation.repair) {
    // The refutation is still recorded, and so is why nothing more was done
    // about it: "repaired twice and stopped because the answer stopped
    // changing" is a different fact from "never repaired".
    const stopped = withRepairMarker(input.detail, { attempted: true, attempts: made, maxAttempts, nodeId: attempt.record.nodeId, code, history: records, phase: "settled", outcome: "stopped", stopped: continuation.stopped, updatedAt: input.now });
    await input.saveFlowRunDetail(stopped);
    return { detail: stopped, entry, stopped: continuation.stopped };
  }
  const refuted: AutomationStudioFlowRunDetail = withRepairMarker({
    ...input.detail,
    // The status the verification already decided. Stated again because the
    // recovery reads it, and a detail read back mid-write must not be the one
    // thing that stops the repair.
    summary: { ...input.detail.summary, status: "failed" },
    actionAttempts: [...(input.detail.actionAttempts ?? []), attempt.record]
  }, { attempted: true, attempts: attemptNumber, maxAttempts, nodeId: attempt.record.nodeId, code, history: records, phase: "reauthoring", updatedAt: input.now });
  // Saved before the repair starts, so a reader sees a repair in progress
  // rather than a failed run with nothing said about it for the minutes a
  // re-author takes.
  await input.saveFlowRunDetail(refuted);
  const repaired = await input.repair({
    detail: refuted,
    failedTraceAttempt: attempt.trace,
    resultSummary: input.summary,
    ...(input.flow ? { flow: input.flow } : {}),
    ...(input.subflowId ? { subflowId: input.subflowId } : {}),
    current: entry,
    history,
    maxAttempts
  });
  const after = repaired ?? refuted;
  const rerunning = input.willRerun === true && automationStudioRefutedResultFlowWasReauthored(after) && automationStudioRefutedResultReplayReady(after);
  // The marker as this pass wrote it, not as the port answered it: a port that
  // rebuilt the detail from its own reads may carry an older one.
  const saved = withRepairMarker(after, {
    ...repairMarker(refuted),
    phase: rerunning ? "rerunning" : "settled",
    ...(rerunning ? {} : { outcome: "not_rerun" }),
    updatedAt: Math.max(input.now, Date.now())
  });
  await input.saveFlowRunDetail(saved);
  return { detail: saved, entry };
}

/**
 * How a repair that is not going any further ended, in words a reader can key on.
 *
 * - `answered`: the repaired Flow's answer was judged to answer the request.
 * - `unverified`: its answer was put to the check and nothing was settled.
 * - `stopped`: refuted again, and not repaired again (the marker's `stopped` says why).
 * - `not_rerun`: the repair produced no applied edit, or the edit could not be run.
 * - `rerun_failed`: the repaired Flow was run and did not finish with a result to judge.
 */
export type AutomationStudioResultRepairOutcome = "answered" | "unverified" | "stopped" | "not_rerun" | "rerun_failed";

/**
 * The run, with its repair marked finished, or `undefined` when there is no
 * repair in progress to finish.
 *
 * Only a repair still `reauthoring` or `rerunning` is closed, and only once, so
 * this is safe to ask of any run a verification finishes with.
 */
export function automationStudioResultRepairSettled(detail: AutomationStudioFlowRunDetail, outcome: AutomationStudioResultRepairOutcome, now: number): AutomationStudioFlowRunDetail | undefined {
  const marker = repairMarker(detail);
  if (marker.phase !== "reauthoring" && marker.phase !== "rerunning") return undefined;
  return withRepairMarker(detail, { ...marker, phase: "settled", outcome, updatedAt: now });
}

/**
 * Whether this run's result has been taken through the entry point at least
 * once. Read off the run detail rather than held in memory, because the re-run
 * that follows a repair comes back through `runRuntimeSession` as its own pass:
 * the only thing the two passes share is the record.
 */
export function automationStudioRunResultAlreadyRepaired(detail: AutomationStudioFlowRunDetail): boolean {
  return automationStudioRunResultRepairAttempts(detail) > 0;
}

/**
 * How many repairs of this run's answer have been started.
 *
 * A marker written before attempts were counted says only `attempted: true`,
 * which is one.
 */
export function automationStudioRunResultRepairAttempts(detail: AutomationStudioFlowRunDetail): number {
  const marker = repairMarker(detail);
  if (marker.attempted !== true) return 0;
  return Number.isSafeInteger(marker.attempts) && (marker.attempts as number) >= 0 ? marker.attempts as number : 1;
}

function repairMarker(detail: AutomationStudioFlowRunDetail): JsonObject {
  const marker = detail.metadata?.[AUTOMATION_STUDIO_RESULT_REPAIR_METADATA_KEY];
  return marker && typeof marker === "object" && !Array.isArray(marker) ? marker as JsonObject : {};
}

function recordedHistory(detail: AutomationStudioFlowRunDetail): JsonObject[] {
  const history = repairMarker(detail).history;
  return Array.isArray(history) ? history.filter((item): item is JsonObject => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function withRepairMarker(detail: AutomationStudioFlowRunDetail, marker: JsonObject): AutomationStudioFlowRunDetail {
  return { ...detail, metadata: { ...(detail.metadata ?? {}), [AUTOMATION_STUDIO_RESULT_REPAIR_METADATA_KEY]: marker } };
}
