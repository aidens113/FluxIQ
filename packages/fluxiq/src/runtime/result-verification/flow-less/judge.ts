// The judge of an answer with no Flow behind it: "the largest single change in
// verification" (plan D9). Today's judge takes a Flow's trial or run
// (`../verify.ts`, `../build-test/`); this one takes what an attempt got, the rows it
// read, the acts it did, the model's words, the end view and the witnesses, and asks
// whether what the person asked for was got.
//
// **One model call, asked again only for a yes Core refutes.** Today's judge asks up to four times
// because a yes there finishes a build and a no fails a run. Here a yes labels a
// result "checked once" (D9, t296: one yes once finished a build on wrong rows), and a
// no or an unsure goes back to the model with its reason, which keeps looking. So
// nothing here asks again, except that a yes whose citations Core refutes is asked again, within the same check, with Core's sentences and what a valid citation is, until the same refuted citations come back (then it is unsure), and that a reply which could not be read is asked again until one is (below, t979).
// A yes here must also stand on the rows the result holds (`yesOnRows`, `../cited-yes/records-yes.ts`, t875): one
// that cites none of them, says nothing of the records asked, or counts other records on the site than the rows held
// is refuted the same way, so a judge that only forgot to cite or count gets its chance to. A transport fault the provider's retry policy retries
// inside the call (`../../llm/provider-retry/`) is one question still: no answer came
// back to be weighed.
//
// **A reply that arrived and could not be read is asked again until one is read (t979).** Live run
// `run-mwoznmcq-cd1d4618` (F25): two of four Haiku judge replies (0047, 0053) were `llm.provider_malformed_response`
// at HTTP 200 -- a long diagnosis whose JSON, nested as text in the decider's `result_json` transport, collapsed part-way
// through -- and with no answer the check was not judged and the attempt had to decide again to be asked again. Such a
// check is now asked again within this one call of the judge (`../unreadable-asks/`): every such ask carries a short
// note of what could not be read, last in what it is shown; a judge continuing the decider's conversation is asked again
// in that conversation, its reply answered there, never handed to a judge that sees less (t1065,
// `../unreadable-asks/asks.ts`). Every re-ask stays on the same model. No count ends it: the purse, the attempt's budget and this
// check's own deadline do, the deadline as `not_judged` for time as before. A refused key, an empty balance and a
// purse's refusal are not asked again. A readable reply is read exactly as a first one is.
//
// **Reused, by import:** the harness and `taskKind: "loop_verification"`, the deadline
// (`../deadline.ts`), the reply reading and its fail-closed rule (`../verdict/`,
// so only an explicit yes passes and a yes citing a cell the rows do not hold is
// unsure, t810) and the screen on a judge's words (`../judgement-screen.ts`). Two
// rules of today's are left out: no `wording`, because a yes held for a missing quote
// could only be settled by asking the judge again, and no reply here can ask; and no
// computed facts, which read a Flow's own record.
//
// **Sized to the model that judges.** A run may judge on a model of its own, and the
// request is built to that model's window (`../../llm/harness/sized-request.ts`). What
// does not fit it whole is sent in a shorter form that says what it summarised
// (`./window-fitting.ts`), never refused by size and read as not judged.
//
// **What a call that gave nothing is.** `not_judged`, never a throw and never a no: it
// says nothing about the answer. Only a cancellation throws, for the attempt to end
// on the person's Stop.
//
// **A yes Core holds says why (t1032).** A yes held for evidence Core could not read, or for an exclusion it was not
// shown, was told to the model only as "could not tell" (run-mwv5m906-5e999159, 0094): it now carries Core's reason and,
// for unread evidence, the calls it was (`./held-yes.ts`). And where the result's own contract names the table asked for, a
// yes must stand on rows that are that table (`askedColumns`, `../cited-yes/records-yes.ts`).
//
// **A judge on its own request is shown the pages (t1084).** A judge that continues no decider -- every replay's, since a
// replay makes no decision -- reads no decider's conversation, and the trail it is shown leaves the pages out. Live run
// `run-mwz29d50-c3a32a9c` attempt 3: its replay judge could not see the rating and pickup line the item was chosen by,
// answered unknown, and a Flow that had worked was repaired. So each form it is sent carries the page views kept beside
// the summary, last (`../judge-evidence/page-views.ts`). So does a judge marked as continuing the decider (t1089): its
// provider may still send it on its own request (no decider held, a continuation past the window, a decider that offered
// no answer tool), and only the provider knows. One that really continues has them left out of its message there
// (`../../models/providers/anthropic/continuation.ts`), and reads the pages in the decider's conversation.
//
// **Rows that share a label are cited apart from the first ask (t1087, t1089).** The judge's copy gives each such row its
// handle, and says the citation rule beside them (`../request-rows/summary/with/row-handles.ts`,
// `../cited-yes/citation-rule.ts`); before, a judge learned the handles only from Core's refusal on a re-ask.
//
// **A yes that also advises a change is a yes.** Its `patchNeeded` is about a Flow, and
// there is none here to change.
//
// **A no that names no contradiction is unknown (t1072).** The question allows a no only on a concrete contradiction,
// said in `observed`. Run `run-mwyfoz8o-507c92f6` (0101) said no over right rows in the right order, its own summary
// saying only that one value could not be seen, with `observed` empty and no defect beyond a cell it also checked as right.
// Such a no is read from the reply's shape (`./named-contradiction.ts`) as the unknown it is, with Core's words first.

import type { AutomationStudioFlowInstruction } from "../../../flows/authoring/model/index.ts";
import { automationStudioLlmBuildTrace, automationStudioLlmStepLogNote, type AutomationStudioLlmTaskResult } from "../../llm/index.ts";
import { AUTOMATION_STUDIO_LLM_FLOW_LESS_JUDGE_SOURCE } from "../../llm/verification-checked/index.ts";
import { automationStudioLlmUnboundedJsonAt } from "../../llm/provider-task/index.ts";
import { automationStudioRunOverrides } from "../../run-overrides/index.ts";
import { automationStudioResultVerificationDeadlineMs, automationStudioResultVerificationWithinDeadline } from "../deadline.ts";
import type { AutomationStudioRunResultSummary } from "../contracts/index.ts";
import { AUTOMATION_STUDIO_RESULT_CITATION_RULE, automationStudioResultRecordsYesRefuted } from "../cited-yes/index.ts";
import { automationStudioResultSummaryWithRowHandles } from "../request-rows/index.ts";
import { AUTOMATION_STUDIO_RESULT_VERDICT_CODES, automationStudioResultVerdict } from "../verdict/index.ts";
import { automationStudioFlowLessScreenedWords } from "./screened-words.ts";
import { automationStudioFlowLessJudgedSummary } from "./judged-summary.ts";
import { automationStudioFlowLessJudgedNoFound } from "./judged-no-found.ts";
import { automationStudioFlowLessNoNamesContradiction } from "./named-contradiction.ts";
import { automationStudioFlowLessHeldYesReason } from "./held-yes.ts";
import { automationStudioFlowLessSummaryFitting } from "./window-fitting.ts";
import { automationStudioLlmUnreadableReplySaid } from "../../models/failures/index.ts";
import {
  automationStudioResultSummaryWithUnreadableNote,
  automationStudioResultUnreadableAsks,
  automationStudioResultUnreadableReplySaid,
  automationStudioResultUnreadableRouting,
  automationStudioResultUnreadableTurn,
  type AutomationStudioResultUnreadableStep
} from "../unreadable-asks/index.ts";
import { AUTOMATION_STUDIO_RESULT_SIZE_REFUSED, automationStudioResultSummaryFormForWindow } from "../run-trail/index.ts";
import type { AutomationStudioFlowLessJudgeInput, AutomationStudioFlowLessJudgement, AutomationStudioFlowLessSummary } from "./types.ts";
import { automationStudioJudgeEvidenceCapability } from "../../llm/harness-options/index.ts";
import { AutomationStudioJudgePageViews } from "../judge-evidence/index.ts";

/** Where the call's intervention says it came from, and what gives it the Flow-less schema (`../../llm/verification-checked/reply-required.ts`). */
const SOURCE = AUTOMATION_STUDIO_LLM_FLOW_LESS_JUDGE_SOURCE;
const BALANCE_CODE = "llm.provider_balance_exhausted";
/** The provider's pre-send refusal of a context that is not JSON (`../../llm/provider-task/preflight.ts`). */
const UNBOUNDED_CODE = "llm.provider_request_context_unbounded";
const NO_BALANCE = "The model service says the account has no balance left, so this was not judged.";
const PURSE_REFUSED = "The attempt's budget could not pay for the check, so it was not judged.";
/** The most of the check's own words a result keeps: a result's words are bounded, and one over the bound is left off whole. */
const READING_MOST = 450;
const WITHHELD_SENTENCE = "(withheld)";
const NO_ANSWER = "The check answered without saying whether this is what was asked for, so it was not judged.";
/** A no read as unknown (header, t1072): Core's words, before the check's own. */
const NAMED_NOTHING = "The check answered no without naming a contradiction in the evidence: it said nothing in observed, and listed no row, act or value it found wrong that it did not also give as right. So it is read as unknown, not no: nothing is shown wrong.";

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
  if (input.deniedEvidenceKeys === undefined) return { verdict: "unsure", reason: "The current evidence privacy declaration is unavailable, so this result remains unconfirmed.", checkedWhat: "Required semantic evidence could not be disclosed under an unknown privacy declaration." };
  const judged = automationStudioFlowLessJudgedSummary(input.summary, input.deniedEvidenceKeys, { ...automationStudioJudgeEvidenceCapability(input), projectJudgeEvidence: input.projectJudgeEvidence });
  const { read } = judged;
  // Rows that share a label carry their handles on the judge's copy, with the rule for citing them, from the first ask
  // on (header, t1087, t1089); the deciding digest reads `judged.sent`, which holds neither.
  const sent = automationStudioFlowLessWithRowHandles(judged.sent);
  // Today's race leaves a call running behind its deadline, and a call waiting on a locked key would then be paid for with nobody to read it. This deadline stops the call, and gives back what a person was waited for.
  const expiry = new AbortController();
  const signal = input.signal ? AbortSignal.any([input.signal, expiry.signal]) : expiry.signal;
  // The check's deadline: the caller's, else the run's own (`judgeMs`), else today's derivation from the per-call timeout, which a run's `llmCallMs` replaces because the harness will use it for each call.
  const deadlines = automationStudioRunOverrides()?.deadlines;
  const callMs = deadlines?.llmCallMs ?? input.timeoutMs;
  const disarm = automationStudioFlowLessJudgeDeadline(input.deadlineMs ?? deadlines?.judgeMs ?? automationStudioResultVerificationDeadlineMs(callMs), input.personHeldMs, () => expiry.abort());
  // A yes whose citations Core refutes is asked again, within this one check and its one deadline, until the refuted citations repeat.
  const tried = new Set<string>();
  let sentNow: AutomationStudioRunResultSummary = sent;
  // A judge on its own request reads no decider's conversation, so each form carries the pages the result rests on, last
  // (`../judge-evidence/page-views.ts`, t1084): a replay's judge, which no decision precedes, could not otherwise see what
  // the page showed. A judge marked as continuing the decider carries them too, because only its provider knows whether it
  // really continues: one that does leaves them out, reading the pages in the decider's conversation, and one sent on its
  // own request after all keeps them (`../../models/providers/anthropic/continuation.ts`, t1089).
  const pageViews = AutomationStudioJudgePageViews.of(judged.sent);
  // The forms of what is sent, whole first, and the one to send: the first that fits the judging model's window by a
  // conservative measure (`../run-trail/window.ts`, t965). A refusal for size steps down one form, and is never read as not judged while one is left.
  // A continuing judge's form is chosen without the pages it sends only on its own request; the harness steps that request
  // down by the provider's own measure (`../../llm/harness/sized-request.ts`).
  const bare = (summary: AutomationStudioRunResultSummary) => [summary, ...automationStudioFlowLessSummaryFitting(summary)];
  const formsOf = (summary: AutomationStudioRunResultSummary) => bare(summary).map((each) => AutomationStudioJudgePageViews.shown(each, pageViews));
  const formFor = (summary: AutomationStudioRunResultSummary, shown: readonly AutomationStudioRunResultSummary[]) => automationStudioResultSummaryFormForWindow(input.continuesDecider === true ? bare(summary) : shown, input.tokenLimits, Buffer.byteLength(input.summary.instructions, "utf8"));
  let forms = formsOf(sentNow);
  let form = formFor(sentNow, forms);
  // This check's unreadable replies: the note and the request its next ask carries (header, t979).
  const unreadable = automationStudioResultUnreadableAsks({ continuesDecider: input.continuesDecider === true });
  const noted = (shown: AutomationStudioRunResultSummary): AutomationStudioRunResultSummary => (unreadable.said === undefined ? shown : automationStudioResultSummaryWithUnreadableNote(shown, unreadable.said, unreadable.steer));
  try {
    for (;;) {
      const bounded = await automationStudioResultVerificationWithinDeadline({
        deadlineMs: 0,
        signal,
        judge: () => input.run({
          taskKind: "loop_verification",
          projectId: input.projectId,
          flowId: input.flowId,
          ...(input.runId ? { runId: input.runId } : {}),
          instructions: [asked(input)],
          // After an unreadable reply, each form carries the note on what could not be read, last (`../unreadable-asks/note.ts`).
          resultSummary: noted(forms[form]!),
          // Where the judging model's window cannot hold even that, the harness sends a shorter form still, each saying what it summarised (`./window-fitting.ts`).
          resultSummaryFitting: forms.slice(form + 1).map(noted),
          ...(input.deniedEvidenceKeys === undefined ? {} : { deniedEvidenceKeys: input.deniedEvidenceKeys }),
          provider: input.provider,
          ...(callMs !== undefined ? { timeoutMs: callMs } : {}),
          ...(input.tokenLimits ? { tokenLimits: input.tokenLimits } : {}),
          signal,
          // A judge continuing the decider's conversation says so, for its routing and its adapter (`./types.ts`, t965), until
          // an unreadable reply keeps it in that conversation, the reply answered there, on the same model (header, t979, t1065).
          metadata: { source: SOURCE, expectedOutput: "diagnosis", ...automationStudioResultUnreadableRouting(unreadable, input.continuesDecider === true) }
        })
      });
      if (input.signal?.aborted) throw input.signal.reason ?? cancelled();
      if (!bounded.settled || expiry.signal.aborted) {
        if (!expiry.signal.aborted && !bounded.settled && bounded.reason === "threw" && isCancellation(bounded.error)) throw bounded.error;
        if (!expiry.signal.aborted && !bounded.settled && bounded.reason === "threw") automationStudioFlowLessJudgeNotSent(thrownAccount(bounded.error));
        return unanswered(read, expiry.signal.aborted ? "llm.provider_timeout" : undefined);
      }
      if (form < forms.length - 1 && refusedForSize(bounded.value)) {
        form += 1;
        continue;
      }
      const got = reading(bounded.value, read, input.summary);
      // Unreadable: asked again with the note, on the same model (header, t979).
      if (got.unread !== undefined) {
        automationStudioFlowLessUnreadableNoted(unreadable.unread(got.unread), got.unread);
        await automationStudioResultUnreadableTurn();
        continue;
      }
      unreadable.readable();
      if (!got.refuted) return got.judgement;
      const key = [...got.refuted].sort().join("|");
      if (tried.has(key)) return got.judgement;
      tried.add(key);
      sentNow = automationStudioFlowLessCitationNotice(sent, got.refuted);
      forms = formsOf(sentNow);
      form = formFor(sentNow, forms);
    }
  } finally {
    disarm();
  }
}

/** The provider refused the request as larger than its model's window (`../run-trail/window.ts`). */
function refusedForSize(result: AutomationStudioLlmTaskResult): boolean {
  return !result.ok && result.diagnostics.some((diagnostic) => diagnostic.severity === "error" && diagnostic.code === AUTOMATION_STUDIO_RESULT_SIZE_REFUSED);
}

/**
 * A judgement, and where it is an unsure for citations Core refuted, Core's sentences for them (the re-ask's grounds);
 * where the reply arrived and could not be read, what could not be read (`unread`, header, t979).
 */
type Reading = { judgement: AutomationStudioFlowLessJudgement; refuted?: readonly string[]; unread?: string };

/** A check asked again after an unreadable reply, said in the run's step log: Core's words only, never the reply. */
function automationStudioFlowLessUnreadableNoted(step: AutomationStudioResultUnreadableStep, said: string): void {
  const how = step === "in_conversation"
    ? "so it stays in the decider's conversation: the reply is answered there and the verdict asked for again, on the same model (on its own request where the decider answered in JSON text)"
    : step === "steered"
      ? "the same way as the reply before it, so it is caught as repeating itself and asked again on the same model, told what it repeated and to decide how to go on"
      : "so it is asked again on the same model with a note saying what could not be read";
  automationStudioLlmStepLogNote(`The judge's reply could not be read (${said}), ${how}.`);
}

function reading(result: AutomationStudioLlmTaskResult, read: AutomationStudioRunResultSummary, summary: AutomationStudioFlowLessSummary): Reading {
  const response = result.ok && result.response?.kind === "diagnosis" ? result.response : undefined;
  if (!response) {
    const error = result.diagnostics.find((diagnostic) => diagnostic.severity === "error");
    const code = error?.code;
    if (result.diagnostics.some((diagnostic) => diagnostic.severity === "error" && diagnostic.code === BALANCE_CODE)) return { judgement: { verdict: "not_judged", reason: NO_BALANCE, emptyBalance: true } };
    if (code !== undefined && PURSE_CODES.has(code)) return { judgement: { verdict: "not_judged", reason: PURSE_REFUSED, refusedByPurse: true } };
    // A reply that arrived and could not be read is asked again (header, t979).
    const unread = result.providerInvocation === "not_attempted" ? undefined : automationStudioResultUnreadableReplySaid(result.diagnostics);
    if (unread !== undefined) return { judgement: unanswered(read, code), unread };
    // Refused before it was sent: no provider step records it, so this does (t974).
    if (result.providerInvocation === "not_attempted") {
      // A context that is not JSON is refused in Core's fixed words, so where it is not is found here (`../../llm/provider-task/unbounded-json.ts`).
      const where = code === UNBOUNDED_CODE ? automationStudioLlmUnboundedJsonAt(result.request.context) : undefined;
      automationStudioFlowLessJudgeNotSent({ code, message: [error?.message, where ? `The request held ${where}.` : undefined].filter(Boolean).join(" ") });
    }
    return { judgement: unanswered(read, code) };
  }
  // A reply cut off after its verdict is read from its whole fields alone (`../verify.ts`, t653).
  const cut = response.truncatedAfterVerdict === true;
  // The table the request names, where the result's own contract says it (sure): a yes must stand on rows that are it (t1032).
  const askedColumns = summary.resultEvidence?.answerContract?.columns;
  const verdict = automationStudioResultVerdict({
    summary: read,
    ...(response.diagnosis ? { diagnosis: response.diagnosis } : {}),
    ...(response.summary && !cut ? { summaryText: response.summary } : {}),
    basis: "model",
    yesOnRows: true,
    ...(askedColumns?.length ? { askedColumns } : {})
  });
  if (verdict.basis === "model_silent") return { judgement: { verdict: "not_judged", reason: NO_ANSWER, unanswered: true } };
  // A cut yes its whole fields do not carry was cut off before it could be read, and is asked again as any unreadable reply is (t979).
  if (cut && response.diagnosis?.answersRequest === "yes" && verdict.verdict !== "answers") return { judgement: unanswered(read, "llm.provider_output_truncated"), unread: automationStudioLlmUnreadableReplySaid({ issueCodes: ["llm.provider_output_truncated"] }) };
  if (verdict.verdict === "answers") return { judgement: { verdict: "yes", reason: "It was judged to be what was asked for.", checkedWhat: checked(summary) } };
  if (verdict.verdict === "does_not_answer") {
    const said = readingWords(verdict.repair?.judgement);
    // A no that names no contradiction is read as the unknown its question asks for (header, `./named-contradiction.ts`, t1072).
    if (!automationStudioFlowLessNoNamesContradiction(response.diagnosis)) return { judgement: { verdict: "unsure", reason: said ? `${NAMED_NOTHING} What it said: ${said}` : NAMED_NOTHING, checkedWhat: meantToCheck(summary) } };
    // What it found wrong goes on to the model beside its words (`./judged-no-found.ts`, t1011).
    const found = automationStudioFlowLessJudgedNoFound(verdict.repair);
    return { judgement: { verdict: "no", reason: said ?? "It was judged not to be what was asked for.", checkedWhat: failed(summary, said), ...(found ? { found } : {}) } };
  }
  if (verdict.code === AUTOMATION_STUDIO_RESULT_VERDICT_CODES.yesCitationRefuted) {
    const refuted = verdict.yesCitations?.refuted ?? [];
    // Core's own sentences on the rows held carry counts and Core's words only, so they may lead the reason (t875); a cited cell's words never do.
    const onRows = automationStudioResultRecordsYesRefuted(read, response.diagnosis, response.summary && !cut ? response.summary : undefined, askedColumns);
    const reason = onRows.length ? `The check said yes, but it does not stand on the rows the result holds, so it stands unconfirmed. ${onRows.join(" ")}` : "The check said yes, but a value it cited is not in the rows that were read, so it stands unconfirmed.";
    return { judgement: { verdict: "unsure", reason, checkedWhat: meantToCheck(summary) }, ...(refuted.length ? { refuted } : {}) };
  }
  // A yes Core held for its own reason says that reason, never only that the check could not tell (t1032).
  if (response.diagnosis?.answersRequest === "yes") return { judgement: { verdict: "unsure", reason: automationStudioFlowLessHeldYesReason(verdict.reason, read), checkedWhat: meantToCheck(summary) } };
  return { judgement: { verdict: "unsure", reason: readingWords(verdict.unsureReading) ?? "The check could not tell whether this is what was asked for.", checkedWhat: meantToCheck(summary) } };
}

/**
 * The judge's copy with each stored row that shares a label given its handle (`../request-rows/summary/with/row-handles.ts`,
 * t1087), and, where any does, what a valid citation is (`validCitation`, the shared rule of `../cited-yes/citation-rule.ts`),
 * so the first ask already says how such rows are cited (t1089). `sent` itself where no label is shared. The page views kept
 * beside `sent` stay kept beside the copy, which holds the same trail.
 */
function automationStudioFlowLessWithRowHandles(sent: AutomationStudioRunResultSummary): AutomationStudioRunResultSummary {
  const handled = automationStudioResultSummaryWithRowHandles(sent);
  return handled === sent ? sent : ({ ...handled, validCitation: AUTOMATION_STUDIO_RESULT_CITATION_RULE } as unknown as AutomationStudioRunResultSummary);
}

/** What a yes on rows says of them, said to the judge again after a yes Core could not stand on the rows held (t875). Generic: no site, task or product is named. */
const RECORDS_RULE = "A yes on a result that holds rows cites in checked each stored row that answers the request, and says in answerRecords whether the request asks for records as its answer (asked) and, where it does, how many records the site shows that answer it (siteShows): the records the request names, counted as the site shows them, never the rows that happen to be stored. Where that count is not the rows held, the rows are not those records: answer no, naming what is missing in defects. A request whose answer is that there are none is asked true, siteShows 0, over no rows, citing none. A yes stands only on what is here: where what was asked cannot be judged from it, answer unknown.";

/**
 * The summary sent again with Core's sentences for each refutation of the last yes and what a valid yes cites (the re-ask
 * of `automationStudioFlowLessJudge`): the shared citation rule (`../cited-yes/citation-rule.ts`, t1087), said here unless
 * the copy already says it beside the rows' handles.
 */
function automationStudioFlowLessCitationNotice(sent: AutomationStudioRunResultSummary, refuted: readonly string[]): AutomationStudioRunResultSummary {
  const sentences = refuted.map((sentence) => automationStudioFlowLessScreenedWords(sentence).text ?? WITHHELD_SENTENCE);
  const said = Object.hasOwn(sent, "validCitation");
  return { ...sent, citationsNotMatched: { note: "Core could not confirm your last yes on the stored rows: each line of notMatched says why. Judge again on the rows themselves, citing only cells the stored rows hold.", notMatched: sentences, ...(said ? {} : { validCitation: AUTOMATION_STUDIO_RESULT_CITATION_RULE }), onRows: RECORDS_RULE } } as unknown as AutomationStudioRunResultSummary;
}

/**
 * A judge's call that was never sent, said where a person debugging the run looks (t974, F22): a note in the run's step
 * log and a build-trace line (core.log). A call that is sent has its own step folder (`../../llm/step-log/model-step.ts`);
 * one refused before sending -- by the harness, or by the adapter's pre-send check -- or whose harness threw, had none, so
 * live runs run-mwouzg29-ebb0f27d, run-mwov5v61-01468cd3 and run-mwow1z18-81707c66 showed only "not judged". The note
 * carries the code and Core's own message for it; a throw says only its name and code, since its message is not Core's.
 */
function automationStudioFlowLessJudgeNotSent(account: { code?: string | undefined; message?: string | undefined; name?: string | undefined }): void {
  const code = account.code ?? "none";
  const said = account.message?.trim() ? ` ${account.message.trim()}` : account.name ? ` It threw ${account.name}.` : "";
  automationStudioLlmStepLogNote(`The judge's call was not sent (${code}), so the result was not judged.${said}`);
  automationStudioLlmBuildTrace.line(`judge not_sent code=${codeWord(account.code)} name=${codeWord(account.name)}`);
}

/** A thrown error's name and code: its own `code`, or the code its build diagnostic carries (`AutomationStudioFlowBootstrapGenerationError`). */
function thrownAccount(error: unknown): { code?: string; name?: string } {
  const record = (typeof error === "object" && error !== null ? error : {}) as { name?: unknown; code?: unknown; diagnostic?: { code?: unknown } };
  const code = typeof record.code === "string" ? record.code : typeof record.diagnostic?.code === "string" ? record.diagnostic.code : undefined;
  return { ...(code !== undefined ? { code } : {}), ...(typeof record.name === "string" ? { name: record.name } : {}) };
}

/** A code-shaped value for the build trace, which carries no sentence; `-` for anything else. */
function codeWord(value: string | undefined): string {
  return value !== undefined && /^[A-Za-z0-9_.:-]{1,120}$/u.test(value) ? value : "-";
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
    ...actCounts(summary),
    ...(summary.answerText !== undefined ? ["the model's own answer"] : [])
  ];
  return got.length ? got.join(", ") : undefined;
}

/** An act an earlier attempt did, as Core's act record says it on a result (`../../answer-first/act-record/carried-words.ts`). */
const CARRIED_ACT = /^(?:Already done earlier|May already be done): /u;

/** The acts this attempt did on the site, and apart from them how many were already done earlier: a carried act is never this attempt's. */
function actCounts(summary: AutomationStudioFlowLessSummary): string[] {
  const earlier = summary.acts.filter((act) => CARRIED_ACT.test(act.what)).length;
  const own = summary.acts.length - earlier;
  return [
    ...(own > 0 ? [`${own} ${own === 1 ? "act" : "acts"} on the site`] : []),
    ...(earlier > 0 ? [`${earlier} already done earlier`] : [])
  ];
}

/** A result's `checkedWhat` on a yes: what was checked. The card says it under "Checked", with how many times the attempt knows it was. */
function checked(summary: AutomationStudioFlowLessSummary): string {
  const got = held(summary);
  return got ? `${got}, against what was asked for.` : "nothing to show, against what was asked for.";
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
