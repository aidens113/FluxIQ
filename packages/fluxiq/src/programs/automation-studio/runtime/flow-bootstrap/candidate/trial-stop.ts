// What stopped a trial that did not run to its end, said to the builder every
// time (lane 3, `run-mvcvzwk1-c1d869e4`, steps 0083 and 0085).
//
// Two trials of one revision each came back `execution_failed` after about
// 500 s with `feedback: { code: "candidate.trial_port_failed" }` and nothing
// else, and the instruction said "Read the feedback for the step that failed"
// though the feedback named no step. The trial port had thrown after the run
// itself ended (its session reads `execution: succeeded`, and no judge call was
// made for either), and the gate (`./trial-gate.ts`) answers a port that throws
// with its code alone, since the error's text may carry page or account detail.
// So the builder tested the same revision again, blind, and the build ran out
// of time.
//
// Now every `execution_failed` answer carries, in the same feedback object the
// builder already reads, `stoppedBy`: what stopped the trial, in Core's words,
// read off what the trial answered. One of:
//
// - `step`: the step listed last failed and the run stopped there: its number,
//   label and failure code, and how many times it had run before in the trial
//   (a step inside a repeat runs once a pass), with what the step said happened
//   where it said something a model may read (`actual`);
//   a run longer than the feedback's listing lists its first steps and then the
//   step it stopped at, by its real number (S5, `run-mvgw3ve5-294881b5` 0089,
//   where an 86-step repeat's stop was past the 40 listed and never named), so
//   that step is named here too, with how many steps the listing leaves out;
// - `graph`: the Flow's graph ended the run (a route with no edge, a step never
//   reached), in the trial's own words;
// - `start`: the trial's start failed before any step ran;
// - `trial_runner`: Core's trial runner itself threw, named by the error's kind
//   only (its `name`, never its text), so no step of the Flow is to blame and no
//   judge was asked;
// - `trial_runner`, too, where Core could not read or use the trial's answer
//   (a malformed or mismatched one), named by the gate's code;
// - `run`: no step failed, and the run stopped between steps, by its code.
//
// The instruction names it after the gate's own first sentence, and says what
// to do for that kind of stop. Two trials of one revision that stopped the same
// way -- the same step, node and failure, or the trial runner failing with the
// same kind of error when its port threw -- close that revision to re-testing
// (t368), and the instruction says so. Generic words: never a scenario's site
// or task.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";

/** The code a no-progress loop fails with (`../../executor/repeat-progress/`). */
const NO_PROGRESS = "repeat.no_progress";
/** The gate's codes for a trial answer it could not read or use (`./trial-gate.ts`, `../subflow-candidate/subflow-trial-gate.ts`). */
const UNREAD = /\.trial_(?:result_invalid|result_mismatch|identity_mismatch)$/u;
/** The gate's code for a trial port that threw. */
const PORT_FAILED = /\.trial_port_failed$/u;
/** The most of a label quoted back. */
const MAX_LABEL = 80;

type Answer = { verdict: string; feedback: JsonObject };

function isObject(value: unknown): value is JsonObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function label(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.trim() ? value.replace(/\s+/gu, " ").trim().slice(0, MAX_LABEL) : undefined;
}

/** The last listed step, when it failed and the run stopped there. */
function failedLast(feedback: JsonObject): JsonObject | undefined {
  const steps = Array.isArray(feedback.steps) ? feedback.steps : [];
  const last = steps.at(-1);
  return isObject(last) && last.status === "failed" && typeof last.step === "number" && Number.isSafeInteger(last.step) && typeof last.definitionId === "string" ? last : undefined;
}

/** How many listed steps before `last` were the same step: its node, label and control. */
function ranBefore(feedback: JsonObject, last: JsonObject): number {
  const steps = Array.isArray(feedback.steps) ? feedback.steps.slice(0, -1) : [];
  return steps.filter((step) => isObject(step) && step.definitionId === last.definitionId && step.label === last.label && JSON.stringify(step.control) === JSON.stringify(last.control)).length;
}

/** How many steps the listing leaves out between its first steps and the last (`stepsLeftOut`). */
function leftOutOf(feedback: JsonObject): number {
  return typeof feedback.stepsLeftOut === "number" && Number.isSafeInteger(feedback.stepsLeftOut) && feedback.stepsLeftOut > 0 ? feedback.stepsLeftOut : 0;
}

function stepStop(feedback: JsonObject, last: JsonObject): JsonObject {
  const named = `Step ${last.step as number}${label(last.label) ? ` (${JSON.stringify(label(last.label))})` : ""}`;
  const leftOut = leftOutOf(feedback);
  // With steps left out of the listing, the listed runs of the same step are not all of them: no count is claimed.
  const before = leftOut ? 0 : ranBefore(feedback, last);
  const failureCode = typeof last.failureCode === "string" ? last.failureCode : undefined;
  const actual = typeof last.actual === "string" && last.actual.trim() ? last.actual.trim() : undefined;
  const runs = before ? `, on its run ${before + 1} in this trial (it ran ${before} ${before === 1 ? "time" : "times"} before, once a pass of the repeat it is in),` : "";
  const stopped = failureCode === NO_PROGRESS
    ? `${named} ended its repeat: ${actual ?? "its last passes stored no new rows and left the page as it was."}`
    : `${named} failed${runs} and the run stopped there${failureCode ? ` (${failureCode})` : ""}.${actual ? ` What it saw: ${actual}` : ""}`;
  const first = Array.isArray(feedback.steps) ? feedback.steps.length - 1 : 0;
  const gap = leftOut ? ` The listing under steps shows the first ${first} and then this one, the last the run took; the ${leftOut} between them ${leftOut === 1 ? "is" : "are"} left out.` : "";
  return { kind: "step", step: last.step as number, ...(label(last.label) ? { label: label(last.label)! } : {}), definitionId: last.definitionId as string, ...(failureCode ? { failureCode } : {}), ...(before ? { ranBefore: before } : {}), ...(leftOut ? { leftOut } : {}), said: `${stopped}${gap}` };
}

/** What stopped an `execution_failed` trial, read off its feedback (header). */
function of(feedback: JsonObject): JsonObject {
  if (isObject(feedback.stoppedBy) && typeof feedback.stoppedBy.kind === "string") return feedback.stoppedBy;
  const code = typeof feedback.code === "string" ? feedback.code : "candidate.execution_incomplete";
  const last = failedLast(feedback);
  if (last) return stepStop(feedback, last);
  // The listing ends with the last step the run took, so the steps it shows and those it leaves out are all the run took (header, S5).
  const listed = (Array.isArray(feedback.steps) ? feedback.steps.length : 0) + leftOutOf(feedback);
  const ending = isObject(feedback.graphEnding) ? feedback.graphEnding : undefined;
  if (ending && typeof ending.happened === "string") return { kind: "graph", code: typeof ending.code === "string" ? ending.code : code, said: ending.happened };
  if (feedback.start === "failed") return { kind: "start", code, said: `The trial's start failed before any step ran (${code}), so nothing in the Flow was tried.` };
  // Core could not read what the trial did (a malformed or mismatched answer), so nothing names a step.
  if (UNREAD.test(code)) return { kind: "trial_runner", failure: code, said: `Core could not read what this trial did (${code}), so no step of the Flow is named.` };
  return { kind: "run", code, said: listed ? `No step of the Flow failed: the run stopped between steps, after step ${listed} (${code}).` : `The run stopped before its first step (${code}).` };
}

/** What the model is told to do next, by the kind of stop (header). `resubmit` is the gate's own words for submitting a change. */
function next(stop: JsonObject, retestable: boolean, resubmit: string): string {
  if (stop.kind === "step" && stop.failureCode === NO_PROGRESS) {
    return `More passes would read the same again, so testing this revision unchanged would stop the same way. Change the repeat's span so each pass reaches rows it has not read yet: its last step has to change the page, or answer ended when nothing more comes. Then ${resubmit}, and test the new revision.`;
  }
  if (stop.kind === "step") {
    return `Read that step's entry under steps: what it says happened, and whether trying again may pass (retryable). Trace the preceding steps and compare the context they reached with what the failed step needs; the cause may be an earlier step. ${retestable ? "If it may, test this same revision again; otherwise correct" : "Correct"} the step that caused the failure, ${resubmit}, then test the new revision.`;
  }
  if (stop.kind === "trial_runner") {
    return retestable
      ? `Nothing in this feedback points at a step to change. Test this same revision again once; if the trial runner fails the same way again, this revision is not tested again: change the Flow, ${resubmit}, then test the new revision, or end the work and say Core's trial runner failed.`
      : `Nothing in this feedback points at a step to change, and testing this revision again would fail the same way: change the Flow, ${resubmit}, then test the new revision, or end the work and say Core's trial runner failed.`;
  }
  return `${retestable ? "If trying again may pass, test this same revision again; otherwise change" : "Change"} the Flow for what stopped it, ${resubmit}, then test the new revision.`;
}

export const automationStudioCandidateTrialStop = Object.freeze({
  of,

  /** The feedback a trial whose port threw answers with (header): its code, and the trial runner named by the error's kind only. */
  portFailed(code: string, error: unknown): JsonObject {
    const kind = error instanceof Error && /^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(error.name) ? error.name : "unknown error";
    return { code, stoppedBy: { kind: "trial_runner", failure: kind,
      said: `Core's own trial runner stopped with an error (${kind}) while running this trial or reading what it did, so no step of the Flow is named and no judge was asked.` } };
  },

  /** `answer` with `stoppedBy` in its feedback when it is `execution_failed` (header); any other answer as it is. */
  told<T extends Answer>(answer: T): T {
    if (answer.verdict !== "execution_failed" || isObject(answer.feedback.stoppedBy)) return answer;
    return { ...answer, feedback: { ...answer.feedback, stoppedBy: of(answer.feedback) } };
  },

  /** How an `execution_failed` trial stopped, for telling two trials that stopped the same way (header); undefined when nothing names it. */
  signature(answer: Answer): string | undefined {
    if (answer.verdict !== "execution_failed") return undefined;
    const stop = of(answer.feedback);
    if (stop.kind === "step") return JSON.stringify({ step: stop.step, definitionId: stop.definitionId, failureCode: stop.failureCode ?? null, code: answer.feedback.code ?? null });
    // Only a port that threw: an answer Core could not read is no evidence the next one will be the same.
    if (stop.kind === "trial_runner" && typeof answer.feedback.code === "string" && PORT_FAILED.test(answer.feedback.code)) return JSON.stringify({ runner: stop.failure, code: answer.feedback.code });
    return undefined;
  },

  /** The instruction for an `execution_failed` answer: the gate's own first sentence, what stopped it, and what to do (header). */
  instruction(answer: Answer, input: { head: string; retestable: boolean; resubmit: string }): string {
    const stop = of(answer.feedback);
    return `${input.head} ${String(stop.said)} ${next(stop, input.retestable, input.resubmit)}`;
  },

  /** What the model is told once two trials of one revision stopped the same way by the trial runner (header). */
  sameRunnerFailure(resubmit: string): string {
    return `Core's trial runner failed the same way in two trials of this revision, so testing it again would fail the same way. Nothing in the feedback points at a step: change the Flow, ${resubmit}, then test the new revision, or end the work and say Core's trial runner failed.`;
  }
});
