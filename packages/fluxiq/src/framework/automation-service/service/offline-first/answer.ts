// What an offline trial's outcome answers a trial gate (trace plan P6, t769,
// design section 3), pure:
//
// | Offline outcome                                        | Answer                      |
// | ------------------------------------------------------ | --------------------------- |
// | refused (exploration, not live, incomplete, ...)        | live, `not_tried`, its code |
// | ran, no gap, verdict `no`                              | kept                        |
// | ran, no gap, `execution_failed` on recorded support    | kept                        |
// | ran, pass (a yes, no gap)                              | live, `passed`              |
// | ran, a gap a step's failure names                      | live, `gap`, step and code  |
// | ran, anything else (judge unsure or not judged, a gap  | live, `inconclusive`, the   |
// |   no step names, nothing reached the recording, ...)   |   evidence's first reason   |
//
// "On recorded support" is the evidence result's own `fail`: no gap, and the
// run reached the recorded client. A run that did not run, or a subflow whose
// predecessors left its entry unprepared, is never kept: what failed there is
// not the proposal. A kept answer carries the runner's result unchanged, its
// standing no beside it, so the gate weighs it as it weighs a live one; an
// offline yes is only ever a note (Decision 3).
//
// The gap's step is the first feedback step whose `failureCode` is a gap
// reason: the matcher answers a command it cannot serve with a failure whose
// code is the reason (`client-gateway/trace-matcher/gap-answer.ts`). Only
// codes go into a note; the gates' words say them (`WORDS.reasons`).
//
// A domain may restate a gap's code on the way to the feedback (the web domain
// reports it as its own unknown failure), and then no feedback step names it. The
// reason is not lost there: the matcher's report holds it, and the feedback still
// says which step the run stopped at. So the note names that step and the reason
// the matcher reported, and the model reads why the recording could not answer.
// With no failed step to name it stays `inconclusive`, under that reason. The
// counts the step log reads carry the same first gap, whatever the note says.

import { CLIENT_GATEWAY_TRACE_MATCHER_GAP_REASONS, type ClientGatewayTraceMatcherGap } from "../../../../client-gateway/index.ts";
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioTrialOfflineFirstAnswer, AutomationStudioTrialOfflineFirstChecked, AutomationStudioTrialOfflineFirstGap, AutomationStudioTrialOfflineFirstNote, AutomationStudioTrialOfflineFirstResult } from "../../../../runtime/flow-authoring/bootstrap/offline-first/index.ts";
import type { AutomationStudioOfflineTrialRan, AutomationStudioOfflineTrialRefusal, AutomationStudioOfflineTrialRunOutcome } from "../offline-trial/index.ts";

/** The trial outcome both offline runners answer, with the result a gate reads. */
type OfflineTrial = AutomationStudioOfflineTrialRunOutcome & { result: AutomationStudioTrialOfflineFirstResult & { entryPrepared?: boolean; standingNo?: unknown } };

const GAP_REASONS: ReadonlySet<string> = new Set(CLIENT_GATEWAY_TRACE_MATCHER_GAP_REASONS);
const KEPT_VERDICTS: ReadonlySet<string> = new Set(["no", "execution_failed"]);

export function automationStudioOfflineFirstAnswer<Trial extends OfflineTrial>(
  outcome: AutomationStudioOfflineTrialRefusal | AutomationStudioOfflineTrialRan<Trial>
): AutomationStudioTrialOfflineFirstAnswer<Trial["result"]> {
  if (outcome.status === "refused") return { kind: "live", note: { outcome: "not_tried", why: outcome.reasonCode } };
  const { trial, evidence, matcher } = outcome;
  const checked = checkedOf(outcome.supported, firstGap(matcher.gaps, trial.result.feedback));
  const live = (note: AutomationStudioTrialOfflineFirstNote): AutomationStudioTrialOfflineFirstAnswer<Trial["result"]> => ({ kind: "live", note, ...(checked ? { checked } : {}) });
  if (evidence.verdict === "pass") return live(trial.result.verdict === "yes" ? { outcome: "passed" } : { outcome: "inconclusive", why: "offline_pass_without_yes" });
  if (evidence.verdict === "fail") {
    if (trial.result.entryPrepared === false) return live({ outcome: "inconclusive", why: "offline_entry_not_prepared" });
    const ran = trial.record.execution === "succeeded" || trial.record.execution === "failed";
    if (!ran || !KEPT_VERDICTS.has(trial.result.verdict)) return live({ outcome: "inconclusive", why: "offline_not_run" });
    const standingNo = trial.result.standingNo;
    return { kind: "kept", result: trial.result, ...(standingNo !== undefined ? { standingNo } : {}), ...(checked ? { checked } : {}) };
  }
  const named = matcher.gaps.length > 0 ? gapStep(trial.result.feedback) : undefined;
  if (named) return live({ outcome: "gap", ...named });
  const gap = checked?.gap;
  if (gap?.step !== undefined) return live({ outcome: "gap", step: gap.step, why: gap.code });
  return live({ outcome: "inconclusive", why: evidence.reasonCodes[0] ?? "offline_inconclusive" });
}

/** The matched and recorded operation counts, when they are counts the gates accept. */
function checkedOf(supported: { matchedOperations: number; recordedOperations: number }, gap: AutomationStudioTrialOfflineFirstGap | undefined): AutomationStudioTrialOfflineFirstChecked | undefined {
  const { matchedOperations: matched, recordedOperations: recorded } = supported;
  const count = (value: number) => Number.isSafeInteger(value) && value >= 0;
  if (!count(matched) || !count(recorded) || matched > recorded) return undefined;
  return gap ? { matched, recorded, gap } : { matched, recorded };
}

/** The matcher's first gap that is not only the echo of an earlier one, with the step the feedback says the run stopped at. */
function firstGap(gaps: readonly ClientGatewayTraceMatcherGap[], feedback: JsonObject): AutomationStudioTrialOfflineFirstGap | undefined {
  const gap = gaps.find((candidate) => candidate.cause !== "after_gap") ?? gaps[0];
  if (gap === undefined) return undefined;
  const named = { code: gap.reason, cause: gap.cause, ordinal: gap.ordinal, action: gap.actionType, fields: gap.fields };
  const step = stoppedAt(feedback);
  return step === undefined ? named : { ...named, step };
}

/** The step the run's feedback says it stopped at: its first gap step, else the first step that failed. */
function stoppedAt(feedback: JsonObject): number | undefined {
  const named = gapStep(feedback);
  if (named) return named.step;
  const steps = Array.isArray(feedback.steps) ? feedback.steps : [];
  for (const entry of steps) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
    const { step, status } = entry;
    if (status === "failed" && typeof step === "number" && Number.isSafeInteger(step) && step >= 1) return step;
  }
  return undefined;
}

/** The first feedback step whose failure is a gap reason: its number and the reason. */
function gapStep(feedback: JsonObject): { step: number; why: string } | undefined {
  const steps = Array.isArray(feedback.steps) ? feedback.steps : [];
  for (const entry of steps) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
    const { step, failureCode } = entry;
    if (typeof failureCode !== "string" || !GAP_REASONS.has(failureCode)) continue;
    if (typeof step === "number" && Number.isSafeInteger(step) && step >= 1) return { step, why: failureCode };
  }
  return undefined;
}
