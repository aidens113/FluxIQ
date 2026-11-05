// The judge of an answer with no Flow behind it: "the largest single change in
// verification" (plan D9). Today's judge takes a Flow's trial or run
// (`../verify.ts`, `../build-test/`); this one takes what an attempt got, the rows it
// read, the acts it did, the model's words, the end view and the witnesses, and asks
// whether what the person asked for was got.
//
// **Exactly one model call, and it is said so.** Today's judge asks up to four times
// because a yes there finishes a build and a no fails a run. Here a yes labels a
// result "checked once" (D9, t296: one yes once finished a build on wrong rows), and a
// no or an unsure goes back to the model with its reason, which keeps looking. So
// nothing here asks again. A transport fault the provider's retry policy retries
// inside the call (`../../llm/provider-retry/`) is one question still: no answer came
// back to be weighed.
//
// **Reused, by import:** the harness and `taskKind: "loop_verification"`, the deadline
// (`../deadline.ts`), the reply reading and its fail-closed rule (`../verdict/`,
// so only an explicit yes passes and a yes citing a cell the rows do not hold is
// unsure, t810) and the screen on a judge's words (`../judgement-screen.ts`). Two
// rules of today's are left out: no `wording`, because a yes held for a missing quote
// could only be settled by asking the judge again, and no reply here can ask; and no
// computed facts, which read a Flow's own record.
//
// **What a call that gave nothing is.** `not_judged`, never a throw and never a no: it
// says nothing about the answer. Only a cancellation throws, for the attempt to end
// on the person's Stop.
//
// **A yes that also advises a change is a yes.** Its `patchNeeded` is about a Flow, and
// there is none here to change.

import type { AutomationStudioFlowInstruction } from "../../../flows/authoring/model/index.ts";
import type { AutomationStudioLlmTaskResult } from "../../llm/index.ts";
import { automationStudioResultVerificationDeadlineMs, automationStudioResultVerificationWithinDeadline } from "../deadline.ts";
import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { AUTOMATION_STUDIO_RESULT_VERDICT_CODES, automationStudioResultVerdict } from "../verdict/index.ts";
import { automationStudioFlowLessJudgedSummary } from "./judged-summary.ts";
import type { AutomationStudioFlowLessJudgeInput, AutomationStudioFlowLessJudgement, AutomationStudioFlowLessSummary } from "./types.ts";

/** Where the call's intervention says it came from. */
const SOURCE = "answerFirstJudge";
const BALANCE_CODE = "llm.provider_balance_exhausted";
const NO_BALANCE = "The model service says the account has no balance left, so this was not judged.";
const PURSE_REFUSED = "The attempt's budget could not pay for the check, so it was not judged.";
/** The most of the check's own words a result keeps: a result's words are bounded, and one over the bound is left off whole. */
const READING_MOST = 450;
const NO_ANSWER = "The check answered without saying whether this is what was asked for, so it was not judged.";

/** The harness's refusals of a call by what its purse or run budget holds: a request too large for the model is another matter. */
const PURSE_CODES: ReadonlySet<string> = new Set(["llm_budget.run_cost_limit", "llm_budget.run_call_limit", "llm_budget.run_total_limit", "llm_budget.run_output_limit", "llm_budget.allowance_unavailable"]);

/** Calls `expired` once `deadlineMs` has passed, not counting what `heldMs` grew by. Answers how to stop it. */
function automationStudioFlowLessJudgeDeadline(deadlineMs: number, heldMs: (() => number) | undefined, expired: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let counted = heldMs?.() ?? 0;
  const arm = (ms: number): void => {
    timer = setTimeout(() => {
      const held = heldMs?.() ?? 0;
      if (held <= counted) {
        expired();
        return;
      }
      const owed = held - counted;
      counted = held;
      arm(owed);
    }, ms);
    timer.unref?.();
  };
  arm(deadlineMs);
  return () => clearTimeout(timer);
}

export async function automationStudioFlowLessJudge(input: AutomationStudioFlowLessJudgeInput): Promise<AutomationStudioFlowLessJudgement> {
  const { read, sent } = automationStudioFlowLessJudgedSummary(input.summary, input.deniedEvidenceKeys);
  // Today's race leaves a call running behind its deadline, and a call waiting on a locked key would then be paid for with nobody to read it. This deadline stops the call, and gives back what a person was waited for.
  const expiry = new AbortController();
  const signal = input.signal ? AbortSignal.any([input.signal, expiry.signal]) : expiry.signal;
  const disarm = automationStudioFlowLessJudgeDeadline(input.deadlineMs ?? automationStudioResultVerificationDeadlineMs(input.timeoutMs), input.personHeldMs, () => expiry.abort());
  const bounded = await automationStudioResultVerificationWithinDeadline({
    deadlineMs: 0,
    signal,
    judge: () => input.run({
      taskKind: "loop_verification",
      projectId: input.projectId,
      flowId: input.flowId,
      ...(input.runId ? { runId: input.runId } : {}),
      instructions: [asked(input)],
      resultSummary: sent,
      deniedEvidenceKeys: input.deniedEvidenceKeys,
      provider: input.provider,
      ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
      signal,
      metadata: { source: SOURCE, expectedOutput: "diagnosis" }
    })
  }).finally(disarm);
  if (input.signal?.aborted) throw input.signal.reason ?? cancelled();
  if (!bounded.settled || expiry.signal.aborted) {
    if (!expiry.signal.aborted && !bounded.settled && bounded.reason === "threw" && isCancellation(bounded.error)) throw bounded.error;
    return unanswered(read, expiry.signal.aborted ? "llm.provider_timeout" : undefined);
  }
  return reading(bounded.value, read, input.summary);
}

function reading(result: AutomationStudioLlmTaskResult, read: AutomationStudioRunResultSummary, summary: AutomationStudioFlowLessSummary): AutomationStudioFlowLessJudgement {
  const response = result.ok && result.response?.kind === "diagnosis" ? result.response : undefined;
  if (!response) {
    const code = result.diagnostics.find((diagnostic) => diagnostic.severity === "error")?.code;
    if (result.diagnostics.some((diagnostic) => diagnostic.severity === "error" && diagnostic.code === BALANCE_CODE)) return { verdict: "not_judged", reason: NO_BALANCE, emptyBalance: true };
    return code !== undefined && PURSE_CODES.has(code) ? { verdict: "not_judged", reason: PURSE_REFUSED, refusedByPurse: true } : unanswered(read, code);
  }
  // A reply cut off after its verdict is read from its whole fields alone (`../verify.ts`, t653).
  const cut = response.truncatedAfterVerdict === true;
  const verdict = automationStudioResultVerdict({
    summary: read,
    ...(response.diagnosis ? { diagnosis: response.diagnosis } : {}),
    ...(response.summary && !cut ? { summaryText: response.summary } : {}),
    basis: "model"
  });
  if (verdict.basis === "model_silent") return { verdict: "not_judged", reason: NO_ANSWER, unanswered: true };
  if (cut && response.diagnosis?.answersRequest === "yes" && verdict.verdict !== "answers") return unanswered(read, "llm.provider_output_truncated");
  if (verdict.verdict === "answers") return { verdict: "yes", reason: "It was judged to be what was asked for.", checkedWhat: checked(summary) };
  if (verdict.verdict === "does_not_answer") {
    const said = readingWords(verdict.repair?.judgement);
    return { verdict: "no", reason: said ?? "It was judged not to be what was asked for.", checkedWhat: failed(summary, said) };
  }
  if (verdict.code === AUTOMATION_STUDIO_RESULT_VERDICT_CODES.yesCitationRefuted) return { verdict: "unsure", reason: "The check said yes, but a value it cited is not in the rows that were read, so it stands unconfirmed.", checkedWhat: meantToCheck(summary) };
  return { verdict: "unsure", reason: readingWords(verdict.unsureReading) ?? "The check could not tell whether this is what was asked for.", checkedWhat: meantToCheck(summary) };
}

/** A call that gave nothing, in the reader's words for what happened to it, by its code. */
function unanswered(read: AutomationStudioRunResultSummary, failureCode: string | undefined): AutomationStudioFlowLessJudgement {
  return { verdict: "not_judged", reason: automationStudioResultVerdict({ summary: read, basis: "model_unavailable", failureCode }).reason, unanswered: true };
}

/** The judge's reading in its own screened words (`../judgement-screen.ts`, through the verdict); nothing where the screens left none. */
function readingWords(said: { expected?: string | undefined; observed?: string | undefined; advice?: string | undefined } | undefined): string | undefined {
  if (!said) return undefined;
  const parts = [said.observed, said.expected ? `Asked for: ${said.expected}` : undefined, said.advice].filter((part): part is string => part !== undefined && part.length > 0);
  return parts.length ? parts.join(" ") : undefined;
}

/** What the result holds, in counts: the model's words could carry page text, which a result may not (`@fluxiq/contracts`, `task-result.ts`). */
function held(summary: AutomationStudioFlowLessSummary): string | undefined {
  const got = [
    ...(summary.rows ? [`${summary.rows.totalRows} ${summary.rows.totalRows === 1 ? "row" : "rows"}`] : []),
    ...(summary.acts.length ? [`${summary.acts.length} ${summary.acts.length === 1 ? "act" : "acts"} on the site`] : []),
    ...(summary.answerText !== undefined ? ["the model's own answer"] : [])
  ];
  return got.length ? got.join(", ") : undefined;
}

/** A result's `checkedWhat` on a yes: what was checked, once. The card says it under "Checked". */
function checked(summary: AutomationStudioFlowLessSummary): string {
  const got = held(summary);
  return got ? `${got}, once against what was asked for.` : "nothing to show, once against what was asked for.";
}

/** On an unsure: what the check was meant to settle and did not. The card says it under "Meant to check". */
function meantToCheck(summary: AutomationStudioFlowLessSummary): string {
  const got = held(summary);
  return got ? `whether ${got} came to what was asked for.` : "whether there was anything to show for what was asked for.";
}

/**
 * On a no: what the check said was wrong, in its own screened words where it gave any, cut to what a result's words may
 * hold; otherwise what it looked at. The card says it under "What failed", so counts and "once" are never what it says.
 */
function failed(summary: AutomationStudioFlowLessSummary, reading: string | undefined): string {
  if (reading !== undefined) {
    if (reading.length <= READING_MOST) return reading;
    const cut = reading.slice(0, READING_MOST - 3);
    return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 40)).replace(/[\s,;:]+$/u, "")}...`;
  }
  const got = held(summary);
  return got ? `${got} did not come to what was asked for.` : "there was nothing to show for what was asked for.";
}

/**
 * The request as an instruction the harness keeps. Required, as a person's words are,
 * unless they hold both "always" and "never", which the harness reads as two required
 * instructions in conflict and fails the call on (`../../llm/harness/instruction.ts`):
 * one person's sentence is no such conflict.
 */
function asked(input: AutomationStudioFlowLessJudgeInput): AutomationStudioFlowInstruction {
  const body = input.summary.instructions;
  return {
    schemaVersion: "0.1",
    instructionId: "instruction.asked",
    title: "What the person asked for",
    body,
    scope: { kind: "project", projectId: input.projectId },
    priority: 1,
    status: "active",
    requirement: /\balways\b/iu.test(body) && /\bnever\b/iu.test(body) ? "advisory" : "required",
    createdAt: 0,
    updatedAt: 0
  };
}

function isCancellation(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function cancelled(): Error {
  const error = new Error("The judge's call was cancelled.");
  error.name = "AbortError";
  return error;
}
