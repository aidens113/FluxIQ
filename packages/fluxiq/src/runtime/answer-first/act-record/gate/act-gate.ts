// The act record's gate on an evidence executor (plan D6): every tool call of an
// attempt goes through it, a forward pass among them, since a forward run sends each
// pass through the loop's executor (`S/runtime/llm/node-tools/replay/forward.ts`).
//
//   before dispatch   `admit`. A refusal dispatches nothing. `already_done` is told as a
//                     result, not a failure: it happened, carry on. `look_first` says to
//                     look where its effect would show. A lasting call is then `begun`,
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

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceToolExecutionResult } from "../../../llm/index.ts";
import type { AutomationStudioAttemptActCall } from "../contracts.ts";
import { automationStudioAttemptActHasTarget } from "../identity/index.ts";
import type { AutomationStudioAttemptActRecord } from "../record.ts";
import { automationStudioAttemptActAnswerRead, type AutomationStudioAttemptActAnswerRead } from "./read-answer.ts";
import { automationStudioAttemptActCallRead } from "./read-call.ts";

const ALREADY_DONE_CODE = "attempt.act_already_done";
const LOOK_FIRST_CODE = "attempt.act_look_first";
const ALREADY_DONE_SAID = "This act already happened in this task, so it was not done again. Count it as done and carry on with what is left.";
const LOOK_FIRST_SAID = "This act may already have happened, so it was not done again. Look at the page where its effect would show: if it is there, count it as done; if it is not, it may be tried again.";
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
}): (call: Call) => Promise<Result | AutomationStudioLlmEvidenceToolExecutionResult> {
  const { record } = input;
  return async (call) => {
    const read = automationStudioAttemptActCallRead(call);
    let begunWords: { what: string; where: string } | undefined;
    if (read.kind === "act") {
      const admission = record.admit(read.act);
      if (admission.kind === "already_done") return refusal(ALREADY_DONE_CODE, ALREADY_DONE_SAID, admission.act);
      if (admission.kind === "look_first") return refusal(LOOK_FIRST_CODE, LOOK_FIRST_SAID, admission.act);
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
      throw error;
    }
    if (read.kind === "pass") return answer;
    const said = automationStudioAttemptActAnswerRead(answer, input.readRowsKey);
    if (read.kind === "act" && begunWords && !recordable(read.act, said)) record.withdrawn(read.act);
    for (const rows of said.reads) record.noteReadRows(rows);
    if (read.kind === "look" ? said.looked || !said.applied : said.looked) record.looked();
    if (read.kind === "act") {
      if (recordable(read.act, said)) record.settled(read.act, {
        effectApplied: said.applied, uncertain: said.uncertain, words: begunWords ?? wordsFor(input.wordsOf?.(call, answer)),
        ...(said.ranWith ? { ranWith: said.ranWith } : {}), ...(said.actedOn !== undefined ? { actedOn: said.actedOn } : {})
      });
      const url = read.act.parameters.url;
      record.notePlace({ ...(said.location !== undefined ? { location: said.location } : {}), ...(typeof url === "string" ? { url } : {}), ...(said.actedOn !== undefined ? { actedOn: said.actedOn } : {}) });
    }
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

/** A refusal: no dispatch, nothing changed, the act named by its screened words. */
function refusal(code: string, instruction: string, act: { what: string; where: string; state: string }): AutomationStudioLlmEvidenceToolExecutionResult {
  return {
    kind: "llm_evidence_tool_execution",
    evidence: { ok: false, code, instruction, act: { what: act.what, where: act.where, state: act.state } },
    effectApplied: false,
    targetsUnchanged: true,
    resultCode: code
  };
}
