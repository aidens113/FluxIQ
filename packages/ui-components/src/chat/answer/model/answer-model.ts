// An outcome as the answer turn it draws, in words, with no DOM. Working is no turn.
//
// Every statement comes from a record: the check from `label`, what happened on the site
// from `acts` (never the model's prose), what is saved from `saved`, the times and cost
// from `spend`. The model's own words are shown only as `answerText`, told as its own.
// There is one failing shape, a spent budget (`budget_out`); a person's Stop is a quiet
// "Stopped"; a wait says what it waits for.

import type { ChatTaskOutcome, ChatTaskResult } from "../../ports/index.ts";
import type { AnswerKind, AnswerModel } from "./answer-types.ts";
import { comparedWords, fromWords, pathWords, savedWords, usdWords, waitingWords } from "../words/index.ts";
import { gotSummary, hasContent, resultHeadline } from "./result-headline.ts";
import { emptyParts, resultParts } from "./result-parts.ts";

/** What the host knows of its port. */
export type AnswerModelOptions = {
  /** False: the port's spend is not real, so nothing is said of cost. */
  reportsSpend: boolean;
  /** The port can raise a spent budget. */
  canAddBudget: boolean;
  /** The time now in ms, for the day a saved line names; the real time by default. */
  nowMs?: number;
};

type Opening = { kind: AnswerKind; headline: string; lead?: string; gotLine?: string };

/** The headline of an attempt that ended or waits, from its status and what it holds. */
function opening(outcome: ChatTaskOutcome, options: AnswerModelOptions): Opening | undefined {
  const { attempt, result } = outcome;
  const content = hasContent(result);
  switch (attempt.status) {
    case "working":
      return undefined;
    case "waiting_for_person": {
      const words = waitingWords(attempt.waitingFor, content);
      return { kind: "waiting", ...words };
    }
    case "stopped_by_person":
      return { kind: "stopped", headline: "Stopped", lead: content ? "Here is what I got before you stopped it." : "It had not found anything yet." };
    case "budget_out": {
      const spent = options.reportsSpend ? `It spent ${usdWords(attempt.spend.usd)} of ${usdWords(attempt.budget.usd)}.` : undefined;
      const got = content ? `What I got: ${gotSummary(result)}.` : "I did not get a result yet.";
      return { kind: "budget_out", headline: "I reached this task's budget.", ...(spent === undefined ? {} : { lead: spent }), gotLine: got };
    }
    case "achieved":
    case "finished_unchecked":
      return result === undefined ? undefined : { kind: result.kind, headline: resultHeadline(result) };
  }
}

/** Said before Run again when what was done on the site may be done a second time. */
const RUN_AGAIN_REPEATS = "Running this again may repeat what was done on the site.";

/**
 * Whether the act record holds an act that happened, or may have. A task that did something
 * on the site and ran out of budget carries on instead (Add budget and carry on keeps its
 * act record, so nothing is done twice); Run again is not offered beside it.
 */
function lastingActs(result: ChatTaskResult | undefined): boolean {
  return result?.acts.some((act) => act.state === "landed" || act.state === "may_have_landed") === true;
}

/** The answer turn for `outcome`; none while it is still working, or before an ended attempt has a result. */
export function answerModel(outcome: ChatTaskOutcome, given: AnswerModelOptions): AnswerModel | undefined {
  // A thread can hold both kinds of outcome, so the port's one flag cannot speak for this one.
  const options = { ...given, reportsSpend: given.reportsSpend && outcome.spendUnknown !== true };
  const start = opening(outcome, options);
  if (start === undefined) return undefined;
  const { attempt, result, saved } = outcome;
  const parts = hasContent(result) ? resultParts(result) : emptyParts(result);
  const ended = attempt.status === "achieved" || attempt.status === "finished_unchecked" || attempt.status === "budget_out" || attempt.status === "stopped_by_person";
  const model: AnswerModel = {
    attemptId: attempt.attemptId,
    taskId: attempt.taskId,
    projectId: attempt.projectId,
    ...start,
    ...parts,
    canRunAgain: ended && !(attempt.status === "budget_out" && options.canAddBudget && lastingActs(result)),
    stuckActions: attempt.status === "waiting_for_person" && (attempt.waitingFor === "stuck_in_a_loop" || attempt.waitingFor === "interrupted"),
    keepGoingCarriesOn: attempt.status === "waiting_for_person" && attempt.waitingFor === "interrupted"
  };
  const from = ended ? fromWords(attempt, result, options.reportsSpend) : undefined;
  if (from !== undefined) model.from = from;
  const compared = ended ? comparedWords(attempt, outcome.comparedTo, options.reportsSpend) : undefined;
  if (compared !== undefined) model.compared = compared;
  const how = ended ? pathWords(attempt.path, attempt.status) : undefined;
  if (how !== undefined) model.how = how;
  if (model.canRunAgain && lastingActs(result)) model.runAgainNote = RUN_AGAIN_REPEATS;
  if (saved !== undefined) model.saved = savedWords(saved, options.nowMs ?? Date.now());
  else if (attempt.status === "budget_out") model.saved = "Nothing saved yet.";
  if (attempt.status === "budget_out" && options.canAddBudget && attempt.budget.usd > 0) {
    model.addBudget = { addUsd: attempt.budget.usd, words: options.reportsSpend ? `Add ${usdWords(attempt.budget.usd)} and carry on` : "Add budget and carry on" };
  }
  return model;
}
