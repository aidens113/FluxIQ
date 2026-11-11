// What a task keeps of an attempt, once the result is safe (design, "Task memory"): the Flow it
// left, the best one kept only if better, what it learned, and where its steps came from.
//
// **Notes.** The model's own from its completion. Where it left none and something failed, Core
// writes one from what it knows: which step, and how the attempt ended. Never a page's words and
// never the judge's, which quote the page.

import type { AutomationStudioTaskResultLabel } from "@fluxiq/contracts/automation";
import { automationStudioAttemptActMarkDoneInAchieved } from "../../../../../runtime/answer-first/act-record/index.ts";
import { automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioAnswerFirstBetterFlow, automationStudioAnswerFirstStepsDigest, type AutomationStudioAnswerFirstSavedFlow, type AutomationStudioAnswerFirstStatedToggle, type AutomationStudioAnswerFirstStepOrigin, type AutomationStudioAnswerFirstTaskNote } from "../task-memory/index.ts";
import { automationStudioAnswerFirstKeptCallerOptions } from "../caller/index.ts";
import { automationStudioAnswerFirstReadShapeOf } from "../completion/index.ts";
import { automationStudioAnswerFirstBestEffort } from "./best-effort.ts";
import type { AutomationStudioAnswerFirstRoundsEnding } from "./rounds.ts";
import type { AutomationStudioAnswerFirstAttemptRun } from "./state.ts";

const JUDGED_NOT_RESULT = "The saved Flow ran to its end, and the check said that was not the result.";
const BUDGET_GONE = "The budget ran out before the result was confirmed.";
const NEEDS_A_PERSON = "It needed a person to clear a check on the page.";
const STUCK_NO_ONE_TO_ASK = "It kept getting stuck and there was nobody to ask whether to keep going.";

type Ended = { label: AutomationStudioTaskResultLabel; candidateId: string | undefined; stated: readonly AutomationStudioAnswerFirstStatedToggle[]; spend: { calls: number; usd: number }; atMs: number };

/** Writes it. A failure costs this record and nothing else: the caller says part of it was not written. */
export async function automationStudioAnswerFirstRemember(run: AutomationStudioAnswerFirstAttemptRun, ending: AutomationStudioAnswerFirstRoundsEnding, ended: Ended): Promise<{ ok: boolean }> {
  const { projectId, flowId } = run.input;
  return await automationStudioAnswerFirstBestEffort(async () => {
    // The Flow is the steps it proposes: a round's opening look, which is no part of it, does not make it another Flow, and an attempt that only looked left none.
    const proposed = run.steps.filter(automationStudioFlowDraftStepIsProposed);
    const steps = proposed.length ? run.steps : [];
    const stepsDigest = automationStudioAnswerFirstStepsDigest(proposed);
    const next: AutomationStudioAnswerFirstSavedFlow = {
      attemptId: run.attemptId, flowId, ...(ended.candidateId === undefined ? {} : { candidateId: ended.candidateId }),
      steps, stepsDigest, label: ended.label, provenWhole: wholeRunYes(run), savedAtMs: ended.atMs, spend: ended.spend,
      ...(ended.stated.length > 0 ? { stated: [...ended.stated] } : {}),
      // What this attempt read when its result was last checked, for a later replay to be compared with (`../completion/read-shape.ts`).
      ...(run.completion.state.held ? { shape: automationStudioAnswerFirstReadShapeOf(run.completion.state.held.rows) } : {})
    };
    const note = noteOf(run, ending, ended.atMs);
    const row = { attemptId: run.attemptId, flowId, ordinal: run.ordinal, route: run.route.kind, ...(run.askedAgain ? { askedAgain: true as const } : {}), ...(ending === "stopped_by_person" ? { stoppedByPerson: true as const } : {}), ...(run.startedFrom ? { startedFrom: run.startedFrom } : {}), ...(run.input.caller ? { caller: automationStudioAnswerFirstKeptCallerOptions(run.input.caller) } : {}), steps: originsOf(run) };
    return await run.memory.update(projectId, run.taskId, (current) => {
      const best = automationStudioAnswerFirstBetterFlow(current.best, next, { flowFailedLive: flowFailedLive(run), wholeRunYes: wholeRunYes(run), keptAssembles: keptAssembles(run, current.best) });
      const known = current.attempts.some((each) => each.attemptId === run.attemptId);
      return {
        ...current, flowId, ...(best ? { best } : {}), latest: next,
        // An attempt that ended achieved says the task is done: what stood is marked, so the same words again press none of it once more (`runtime/answer-first/act-record/done-in-achieved.ts`).
        ...((ending === "achieved" || ending === "taken_unverified") && current.acts?.attemptId === run.attemptId ? { acts: { ...current.acts, data: automationStudioAttemptActMarkDoneInAchieved(current.acts.data) } } : {}),
        notes: note ? [...current.notes, note] : current.notes,
        attempts: known ? current.attempts.map((each) => (each.attemptId === run.attemptId ? row : each)) : [...current.attempts, row]
      };
    });
  });
}

/** A run that sent nothing proves nothing: every step of it may have been refused as already done, and it is judged all the same. */
function wholeRunYes(run: AutomationStudioAnswerFirstAttemptRun): boolean {
  return run.flowRun?.judged === "yes" && run.flowRun.wentOut;
}

/**
 * Whether the Flow the task keeps assembled when this attempt opened, which its route says: a `use`
 * route is one whose saved steps assembled, a `repair` route one whose did not, and so never ran.
 * Only of the Flow the route was read from: another attempt may have kept a different one since,
 * and of that one this attempt knows nothing (`../task-memory/better-flow.ts` then reads its record).
 */
function keptAssembles(run: AutomationStudioAnswerFirstAttemptRun, kept: AutomationStudioAnswerFirstSavedFlow | undefined): boolean | undefined {
  const route = run.route;
  if (!kept || route.kind === "build" || route.saved.stepsDigest !== kept.stepsDigest) return undefined;
  return route.kind === "use";
}

/** The Flow as it was saved did not do the task on the site as it stands. A person's Stop, or a run that never went out, says nothing of the Flow. */
function flowFailedLive(run: AutomationStudioAnswerFirstAttemptRun): boolean {
  if (run.prior?.flowFailedLive) return true;
  const flowRun = run.flowRun;
  if (!flowRun?.wentOut || flowRun.outcome.kind !== "ran") return false;
  return !flowRun.outcome.reachedEnd || flowRun.judged === "no";
}

function noteOf(run: AutomationStudioAnswerFirstAttemptRun, ending: AutomationStudioAnswerFirstRoundsEnding, atMs: number): AutomationStudioAnswerFirstTaskNote | undefined {
  const own = run.completion.state.notes;
  if (own) return { attemptId: run.attemptId, atMs, from: "model", ...own };
  const failed = whatFailed(run, ending);
  return failed ? { attemptId: run.attemptId, atMs, from: "core", failed } : undefined;
}

function whatFailed(run: AutomationStudioAnswerFirstAttemptRun, ending: AutomationStudioAnswerFirstRoundsEnding): string | undefined {
  const outcome = run.flowRun?.wentOut ? run.flowRun.outcome : undefined;
  const failing = outcome?.kind === "ran" ? outcome.failing : undefined;
  const words = [
    ...(failing ? [`The saved Flow stopped at step ${failing.position}. ${failing.happened}`] : []),
    ...(run.flowRun?.judged === "no" ? [JUDGED_NOT_RESULT] : []),
    ...(ending === "budget_out" ? [BUDGET_GONE] : []),
    ...(ending === "waiting_for_check" ? [run.waitingFor === "stuck_in_a_loop" ? STUCK_NO_ONE_TO_ASK : NEEDS_A_PERSON] : [])
  ];
  return words.length ? words.join(" ") : undefined;
}

/** Each step of the Flow the attempt ended with: whether it is one it started with, and what its run did with it. A step changed since never ran as it is now. */
function originsOf(run: AutomationStudioAnswerFirstAttemptRun): AutomationStudioAnswerFirstStepOrigin[] {
  const startedWith = new Set(run.startedWith.map(oneStep));
  const outcome = run.flowRun?.outcome;
  const ran = new Map(outcome?.kind === "ran" ? outcome.steps.map((step) => [step.position, step.ran]) : (run.prior?.origins ?? []).flatMap((origin) => (origin.ran ? [[origin.position, origin.ran] as const] : [])));
  return run.steps.filter(automationStudioFlowDraftStepIsProposed).map((step) => {
    const saved = startedWith.has(oneStep(step));
    const went = saved ? ran.get(step.position) : undefined;
    return { position: step.position, ...(step.words?.target ? { label: step.words.target } : {}), from: saved ? "saved" : "worked_out", ...(went ? { ran: went } : {}) };
  });
}

function oneStep(step: AutomationStudioFlowDraftStep): string {
  return automationStudioAnswerFirstStepsDigest([step]);
}
