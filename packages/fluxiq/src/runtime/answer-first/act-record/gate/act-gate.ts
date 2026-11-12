// The act record's gate on an evidence executor (plan D6): every tool call of an
// attempt goes through it, a forward pass among them, since a forward run sends each
// pass through the loop's executor (`S/runtime/llm/node-tools/replay/forward.ts`).
//
//   before dispatch   `foresee` asks what the domain says the call would be, and `admit`
//                     reads that beside the call. A refusal dispatches nothing. `already_done`
//                     is told as a result, not a failure: it happened, carry on. So a call the
//                     model made by hand answers it without `ok: false`, which says the page
//                     refused it, and names the act as what it really ran as (`ranWith`): the
//                     same act is one call to loop detection, whatever handle it was asked by
//                     (`S/runtime/llm/repeat-guard/loop-detection/`), and three in a row would
//                     otherwise only stall the round, which never asks the person. A forward
//                     pass answers as ever: a walker reads that, and leaves the row out.
//                     Where several rows fit, it says what would help instead. `look_first`
//                     says to look where its effect would show, and only a look after that
//                     opens the act: one before it, the round's own opening look among them,
//                     does not (`../record.ts`). That refusal invites its own resend
//                     (`diagnostics.resend`), since the loop's repeat guard would otherwise
//                     refuse the identical press on a page the look left as it was, and the
//                     way this refusal offers would be one it could never take. A lasting
//                     call is then `begun`,
//                     and this waits for that write: from here until its answer it is on
//                     the persisted record as may have landed (`../record.ts`), so a
//                     process that dies mid-press leaves it held to a look. A write that
//                     fails sends nothing, and says so as a refusal the call may retry.
//   after dispatch    an act is `settled` from what the call answered, never from the
//                     model's words; an observation is `looked`; rows are noted. A declared
//                     call that only read goes back off the record as if never begun.
//   when it throws    a lasting act whose call threw may have happened: nothing else can
//                     be said of a call whose answer was lost, so it is held to a look.
//
// **A person's words for an act are asked once.** A lasting call asks before it is sent, with
// no answer in hand, since the crash this guards against leaves no later chance. A call that
// declares nothing asks only when its answer puts it on the record.
//
// Refusals here are worded for any site, and say nothing of this one's.

import type { AutomationStudioAttemptAct } from "@fluxiq/contracts/automation";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../llm/index.ts";
import type { AutomationStudioLlmEvidenceResendInvitation } from "../../../llm/repeat-guard/index.ts";
import type { AutomationStudioAttemptActCall, AutomationStudioAttemptActForeseen } from "../contracts.ts";
import { automationStudioAttemptActHasTarget } from "../identity/index.ts";
import type { AutomationStudioAttemptActRecord } from "../record.ts";
import { automationStudioAttemptActAnswerRead, type AutomationStudioAttemptActAnswerRead } from "./read-answer.ts";
import { automationStudioAttemptActCallRead } from "./read-call.ts";

const ALREADY_DONE_CODE = "attempt.act_already_done";
const LOOK_FIRST_CODE = "attempt.act_look_first";
const ALREADY_DONE_SAID = "This act already happened in this task, so it was not done again. Count it as done and carry on with what is left.";
const ROW_UNCLEAR_CODE = "attempt.act_row_unclear";
const ROW_UNCLEAR_SAID = "This may be a row that is already done: more than one row fits it and nothing yet tells them apart, so it was not done again, since doing it twice cannot be taken back. Pressing it again will not help. Read something that tells these rows apart and act on the one you mean, or say what you have and what you could not tell.";
const LOOK_FIRST_SAID = "This act may already have happened, so it was not done again. Look at the page where its effect would show: if it is there, count it as done; if it is not, it may be tried again.";
/** The refusals that say a call's act is held done or maybe done, which a forward run counts as a row left out (`./forward.ts`). */
export const AUTOMATION_STUDIO_ATTEMPT_ACT_HELD_CODES: ReadonlySet<string> = new Set([ALREADY_DONE_CODE, ROW_UNCLEAR_CODE, LOOK_FIRST_CODE]);
/** A look-first refusal's one resend, read by the repeat guard (`S/runtime/llm/repeat-guard/resend-admission.ts`). */
const RESEND_ONCE: AutomationStudioLlmEvidenceResendInvitation = "accepted_once";
const NOT_RECORDED_CODE = "attempt.act_not_recorded";
const NOT_RECORDED_SAID = "This act was not done, because the record of what this task did could not be saved first. Nothing was sent, and it may be tried again.";

/** One call as the loop hands it to an executor. */
export type AutomationStudioAttemptActToolCall = { callId: string; toolId: string; value: JsonObject; signal?: AbortSignal; referenceNow?: number };
type Answer = JsonValue | AutomationStudioLlmEvidenceToolExecutionResult;
type Words = { what?: string; where?: string } | undefined;

/** The executor wrapped by the gate (header). */
export function automationStudioAttemptActGate<Call extends AutomationStudioAttemptActToolCall, Result extends Answer>(input: {
  record: AutomationStudioAttemptActRecord;
  executeTool: (call: Call) => Promise<Result>;
  /** A person's words for an act; generic words by class stand in for what it does not give, and for what the contract's screen refuses. */
  wordsOf?: (call: Call, answer: Result | undefined) => Words;
  /** Where the domain's read keeps its rows (`design.md`, `readRowsKey`). */
  readRowsKey?: string;
  /** What the domain says this call would be, before it is sent. Must not throw: the caller answers nothing instead. */
  foresee?: (call: Call) => AutomationStudioAttemptActForeseen | undefined;
}): (call: Call) => Promise<Result | AutomationStudioLlmEvidenceToolExecutionResult> {
  const { record } = input;
  return async (call) => {
    const read = automationStudioAttemptActCallRead(call);
    let begunWords: { what: string; where: string } | undefined;
    if (read.kind === "act") {
      const foreseen = input.foresee?.(call);
      if (foreseen) read.act.foreseen = foreseen;
      const admission = record.admit(read.act);
      if (admission.kind === "already_done" && read.act.stage !== "exploration") return refusal(ALREADY_DONE_CODE, ALREADY_DONE_SAID, admission.act);
      if (admission.kind === "already_done") return alreadyDone(read.act.actionId, admission);
      if (admission.kind === "look_first") return refusal(LOOK_FIRST_CODE, LOOK_FIRST_SAID, admission.act, { diagnostics: { resend: RESEND_ONCE } });
      if (record.lasting(read.act)) {
        begunWords = wordsFor(input.wordsOf?.(call, undefined));
        if (await record.begun(read.act, begunWords) === "not_written") return notRecorded();
      }
    }
    let answer: Result;
    try {
      answer = await input.executeTool(call);
    } catch (error) {
      if (read.kind === "act" && (begunWords || read.act.consequences.length > 0)) record.settled(read.act, { effectApplied: false, uncertain: true, words: begunWords ?? wordsFor(input.wordsOf?.(call, undefined)) });
      try { await record.flushed(); }
      catch (storageError) { throw new AggregateError([error, storageError], "The act's dispatch and settlement persistence both failed."); }
      throw error;
    }
    if (read.kind === "pass") return answer;
    const said = automationStudioAttemptActAnswerRead(answer, input.readRowsKey);
    if (read.kind === "act" && begunWords && !recordable(read.act, said)) record.withdrawn(read.act);
    for (const rows of said.reads) record.noteReadRows(rows);
    if (read.kind === "look" ? said.looked || !said.applied : said.looked) record.looked();
    if (read.kind === "act") {
      if (recordable(read.act, said)) record.settled(read.act, {
        // A press may only say what it pressed once it has answered, so words still blank are asked for again with the answer in hand.
        effectApplied: said.applied, uncertain: said.uncertain, words: begunWords?.what ? begunWords : wordsFor(input.wordsOf?.(call, answer)),
        ...(said.ranWith ? { ranWith: said.ranWith } : {}), ...(said.actedOn !== undefined ? { actedOn: said.actedOn } : {}), ...(said.card !== undefined ? { card: said.card } : {}), ...(said.changedState ? { changedState: true } : {})
      });
      const url = read.act.parameters.url;
      record.notePlace({ ...(said.location !== undefined ? { location: said.location } : {}), ...(typeof url === "string" ? { url } : {}), ...(said.actedOn !== undefined ? { actedOn: said.actedOn } : {}) });
    }
    // Settlement queues its write; do not expose evidence to the next model call before that write commits.
    await record.flushed();
    return answer;
  };
}

/**
 * Whether the call goes on the record: never one that only read, whatever it declared; a
 * declared one whatever it answered, as `settled` reads that; one that declared nothing
 * only when it pressed something that took effect, since a move to an address or a press
 * the answer says changed nothing has nothing to disclose.
 */
function recordable(act: AutomationStudioAttemptActCall, said: AutomationStudioAttemptActAnswerRead): boolean {
  if (said.observe) return false;
  if (act.consequences.length > 0 || act.instructedAct !== undefined) return true;
  return said.applied && !said.pageUnchanged && automationStudioAttemptActHasTarget(act.parameters);
}

function wordsFor(words: Words): { what: string; where: string } {
  // Blank is never person words, so the record's screen says each by its generic line.
  return { what: words?.what ?? "", where: words?.where ?? "" };
}

/** The record could not say this call began, so it was not sent. */
function notRecorded(): AutomationStudioLlmEvidenceToolExecutionResult {
  return {
    kind: "llm_evidence_tool_execution",
    evidence: { ok: false, code: NOT_RECORDED_CODE, instruction: NOT_RECORDED_SAID },
    effectApplied: false,
    targetsUnchanged: true,
    resultCode: NOT_RECORDED_CODE
  };
}

/** A by-hand call of an act already done: no dispatch, nothing changed, and said as what happened (header). */
function alreadyDone(actionId: string, { act, rowsUnclear }: { act: AutomationStudioAttemptAct; rowsUnclear?: true }): AutomationStudioLlmEvidenceToolExecutionResult {
  const code = rowsUnclear ? ROW_UNCLEAR_CODE : ALREADY_DONE_CODE;
  return {
    kind: "llm_evidence_tool_execution",
    evidence: { code, instruction: rowsUnclear ? ROW_UNCLEAR_SAID : ALREADY_DONE_SAID, act: { what: act.what, where: act.where, state: act.state } },
    effectApplied: false,
    targetsUnchanged: true,
    resultCode: code,
    draft: { actionId, effect: "mutate", proposes: false, ranWith: { act: act.id } }
  };
}

/** A refusal: no dispatch, nothing changed, the act named by its screened words. */
function refusal(code: string, instruction: string, act: { what: string; where: string; state: string }, more: JsonObject = {}): AutomationStudioLlmEvidenceToolExecutionResult {
  return {
    kind: "llm_evidence_tool_execution",
    evidence: { ok: false, code, instruction, act: { what: act.what, where: act.where, state: act.state }, ...more },
    effectApplied: false,
    targetsUnchanged: true,
    resultCode: code
  };
}
