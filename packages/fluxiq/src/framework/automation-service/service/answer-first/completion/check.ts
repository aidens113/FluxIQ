// A `complete` decision, checked against what the attempt really got (plan D9): the Flow-less
// judge in place of a Flow's test. Order, each stopping there:
//
//   nothing at all to judge            refused, no model call
//   rows asked for, no read run        refused, no model call: rows come only from a read
//   the same evidence as the last no   refused, no model call: new evidence is what it needs
//   one judge call
//     yes                              accepted, and the attempt is achieved
//     no, unsure                       refused with the screened reason; the digest is kept
//     not judged                       refused, the digest not kept: no answer came back
//     refused by the purse             thrown, so the round ends as a budget-out
//
// The summary is built from Core's records, never the model's: rows from the store, acts from
// the act record, the page from a fresh look, and whether a person's Run again started it. `answer`
// is the one thing of the model's, and it
// is marked as its words wherever it is shown. A judge emits nothing to the chat itself, so
// this says the check, start and end.
//
// **A refusal of the same evidence is free to the purse only in the judge's call.** The model's
// decision that sent it was a whole context, so `refusedAgain` counts them and the caller climbs
// the ladder on it (`../loop-signal/completion-refused-again.ts`). New evidence starts it again.
//
// **Rows come only from a read (lane B, run-mw45itmx-c4d6f5cb).** The request ended "give me ...
// as a table with columns ...", the model did every act, never ran a read, typed the table into
// `answer`, and a judge said yes over 0 rows: the person was given no table. So a request that
// asks for rows back -- read by the one reader Core has for that, the answerability check's
// (`automationStudioFlowBootstrapInstructionAsk`) -- is refused while no read has run in the
// attempt, before any judge. A read that ran and found nothing has run: an empty result is the
// judge's to weigh, and refusing it would keep an honest attempt going until its budget ran out.
// The refusal is an ordinary one, so the attempt goes on to read (`../attempt/round.ts`).
//
// **A look after the acts is evidence (lane B, run-mw4dsh8i-3fb9dc39).** A check said unsure and
// named what it could not see; the model opened that page, searched it and found it, and every
// completion after was refused as the same evidence, because the summary held no look. So what the
// attempt's looks found after the first lasting act (`looked`, from Core's record of each call's
// answer, `../attempt/call-chain.ts`) is in the summary, and so in its digest: a look that found
// something new is new evidence, and the same look again is not. It is bounded -- the latest few, each
// cut short -- and screened line by line as a judge's own words are, so a credential-shaped line
// never reaches the judge and the rest of what was found still does.

import type { AutomationStudioAttemptAct } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioAnswerFirstKeepBackJudge } from "../../../../../runtime/answer-first/attempt-purse/index.ts";
import { automationStudioFlowBootstrapInstructionAsk } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import type { AutomationStudioLlmEvidenceCompletionCheck } from "../../../../../runtime/llm/index.ts";
import { AutomationStudioLlmProviderError } from "../../../../../runtime/models/failures/index.ts";
import { automationStudioFlowLessScreenedWords, automationStudioFlowLessSummaryDigest, type AutomationStudioFlowLessJudgement, type AutomationStudioFlowLessSummary, type AutomationStudioResultEndView } from "../../../../../runtime/result-verification/index.ts";
import type { AutomationStudioAnswerFirstRowsSummary } from "../rows/index.ts";
import { automationStudioAnswerFirstScreenedNote } from "../task-memory/index.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_REFUSED_WORDS as WORDS } from "./refused-words.ts";

/** A check that gave no answer: nothing was refused, so its words when it comes again differ (`AUTOMATION_STUDIO_ANSWER_FIRST_REFUSED_WORDS`). */
export const AUTOMATION_STUDIO_ANSWER_FIRST_NOT_JUDGED_CODE = "answer_first.not_judged";
const NOTHING = "answer_first.nothing_to_judge";
/** A request that asks for rows back, completed while no read has run in the attempt (header). */
const ROWS_NOT_READ = "answer_first.rows_not_read";
/** A completion over what the check last refused: the code the ladder climbs on. */
export const AUTOMATION_STUDIO_ANSWER_FIRST_SAME_EVIDENCE_CODE = "answer_first.same_evidence";
const SAME = AUTOMATION_STUDIO_ANSWER_FIRST_SAME_EVIDENCE_CODE;
const JUDGED_NO = "answer_first.judged_no";
const JUDGED_UNSURE = "answer_first.judged_unsure";
const NOT_JUDGED = AUTOMATION_STUDIO_ANSWER_FIRST_NOT_JUDGED_CODE;

/** Rows are the summary's own shape, and a rough four characters to a token sizes the judge's hold. */
const CHARS_PER_TOKEN = 4;
/** The latest looks the judge is shown, and how much of each (header). */
const LOOKS_SHOWN = 6;
const FOUND_CHARS = 600;
const WHERE_CHARS = 300;
/** Stands in for a line, or an address, the screen dropped whole. */
const WITHHELD = "(withheld)";

type Look = { where: string; found: string };

/** The purse would not pay for the check: the round ends as a budget-out, not as a refusal the model is asked again over. */
export class AutomationStudioAnswerFirstJudgeRefusedByPurse extends Error {
  readonly name = "AutomationStudioAnswerFirstJudgeRefusedByPurse";
}

/** Where the completion stands, for the ending to read. */
export type AutomationStudioAnswerFirstCompletionState = {
  achieved: boolean;
  /** Judge calls that came back with an answer. */
  timesChecked: number;
  checkedWhat?: string | undefined;
  /** The latest completion's own words. */
  answerText?: string | undefined;
  /** The model's notes for the next attempt at this task, screened; never given to the judge. */
  notes?: { worked?: string; failed?: string; quirks?: string } | undefined;
  /** The last judge's no or unsure, its digest and its words. */
  refused?: { verdict: "no" | "unsure"; digest: string; reason: string } | undefined;
  /** Completions refused in a row over exactly what `refused` refused, each a whole paid decision. New evidence puts it back to nothing. */
  refusedAgain: number;
  /** What the result held at the latest check, for the model's refusal and the person's question. */
  held?: { rows: AutomationStudioAnswerFirstRowsSummary; acts: number } | undefined;
  purseRefused: boolean;
};

export type AutomationStudioAnswerFirstCompletionCheck = {
  check(result: JsonObject): Promise<AutomationStudioLlmEvidenceCompletionCheck>;
  state: AutomationStudioAnswerFirstCompletionState;
};

export function automationStudioAnswerFirstCompletionCheck(input: {
  instructions: string;
  rows(): Promise<AutomationStudioAnswerFirstRowsSummary>;
  acts(): readonly AutomationStudioAttemptAct[];
  /** Whether any read has answered in this attempt, rows or none (`../rows/sink-type.ts`, `readsAnswered`). */
  readsRan(): boolean;
  endView(): Promise<AutomationStudioResultEndView | undefined>;
  witnesses(): { before?: JsonObject; after?: JsonObject };
  /** What the attempt's looks found after the first lasting act, oldest first (header). Absent, none. */
  looked?: (() => readonly Look[]) | undefined;
  /** The person pressed Run again: the judge is told it is a repeat they asked for, and judges this attempt's own change. */
  askedAgain?: boolean | undefined;
  judge(summary: AutomationStudioFlowLessSummary): Promise<AutomationStudioFlowLessJudgement>;
  purse: Parameters<typeof automationStudioAnswerFirstKeepBackJudge>[0];
  say(title: string, text: string): void;
  seed?: Pick<AutomationStudioAnswerFirstCompletionState, "timesChecked"> | undefined;
}): AutomationStudioAnswerFirstCompletionCheck {
  const state: AutomationStudioAnswerFirstCompletionState = { achieved: false, timesChecked: input.seed?.timesChecked ?? 0, refusedAgain: 0, purseRefused: false };
  const asks = automationStudioFlowBootstrapInstructionAsk(input.instructions);
  return {
    state,
    check: async (result) => {
      const answerText = typeof result.answer === "string" && result.answer.trim() ? result.answer.trim() : undefined;
      if (answerText !== undefined) state.answerText = answerText;
      const notes = automationStudioAnswerFirstScreenedNote(result.notes as { worked?: unknown; failed?: unknown; quirks?: unknown } | undefined);
      if (notes) state.notes = notes;
      const rows = await input.rows();
      const acts = input.acts();
      state.held = { rows, acts: acts.length };
      if (rows.totalRows === 0 && acts.length === 0 && answerText === undefined) return refused(NOTHING, "You have nothing to check yet: no read has returned a row, no lasting act is on the record, and you gave no answer. Get the result first, and complete when you have it.");
      if (asks.records && rows.totalRows === 0 && !input.readsRan()) return refused(ROWS_NOT_READ,WORDS.rowsNotRead(asks.quote));
      const summary = await summaryOf(input, rows, acts, answerText);
      const digest = automationStudioFlowLessSummaryDigest(summary);
      if (state.refused?.digest === digest) {
        state.refusedAgain += 1;
        return refused(SAME, WORDS.sameEvidence(state.refused.verdict, state.refused.reason));
      }
      state.refusedAgain = 0;
      automationStudioAnswerFirstKeepBackJudge(input.purse, { summaryInputTokens: Math.ceil(JSON.stringify(summary).length / CHARS_PER_TOKEN) });
      input.say("Checking the result", "Checking what I have against what you asked for.");
      const judged = await input.judge(summary);
      if (judged.refusedByPurse) {
        state.purseRefused = true;
        throw new AutomationStudioAnswerFirstJudgeRefusedByPurse(judged.reason);
      }
      // An empty balance ends the attempt as a budget-out, as it does at a decision (`../attempt/decide.ts`); read as "not judged" it would be asked again for ever.
      if (judged.emptyBalance) throw new AutomationStudioLlmProviderError("llm.provider_balance_exhausted", judged.reason);
      if (judged.verdict === "not_judged") {
        input.say("The check did not answer", judged.reason);
        return refused(NOT_JUDGED, `${judged.reason} Complete again when you are ready, or carry on if there is more to get.`);
      }
      state.timesChecked += 1;
      state.checkedWhat = judged.checkedWhat;
      if (judged.verdict === "yes") {
        state.achieved = true;
        state.refused = undefined;
        input.say("Checked", `It is what you asked for, checked ${state.timesChecked === 1 ? "once" : `${state.timesChecked} times`}.`);
        return { ok: true };
      }
      state.refused = { verdict: judged.verdict, digest, reason: judged.reason };
      input.say(judged.verdict === "no" ? "Not there yet" : "Could not confirm it yet", "The check did not confirm this yet, so I am carrying on.");
      return refused(judged.verdict === "no" ? JUDGED_NO : JUDGED_UNSURE, WORDS.judged(judged.reason));
    }
  };
}

async function summaryOf(input: Parameters<typeof automationStudioAnswerFirstCompletionCheck>[0], rows: AutomationStudioAnswerFirstRowsSummary, acts: readonly AutomationStudioAttemptAct[], answerText: string | undefined): Promise<AutomationStudioFlowLessSummary> {
  const endView = await input.endView();
  const witnesses = input.witnesses();
  const looked = shownLooks(input.looked?.() ?? []);
  return {
    instructions: input.instructions,
    ...(rows.datasetId !== undefined ? { rows: { totalRows: rows.totalRows, truncated: rows.truncated, columns: rows.columns, rows: rows.rows } } : {}),
    acts,
    ...(answerText !== undefined ? { answerText } : {}),
    ...(endView ? { endView } : {}),
    ...(Object.keys(witnesses).length ? { witnesses } : {}),
    ...(looked.length ? { looked } : {}),
    ...(input.askedAgain === true ? { askedAgain: true as const } : {})
  };
}

/** The latest few distinct looks, each cut short and screened (header). A look already shown keeps its place, so seeing it again changes nothing. */
function shownLooks(looks: readonly Look[]): Look[] {
  const kept = new Map<string, Look>();
  for (const look of looks) {
    const shown = { where: screened(cut(look.where, WHERE_CHARS)), found: cut(look.found, FOUND_CHARS).split("\n").map(screened).join("\n") };
    const key = JSON.stringify([shown.where, shown.found]);
    if (!kept.has(key)) kept.set(key, shown);
  }
  return [...kept.values()].slice(-LOOKS_SHOWN);
}

/** One line through the screen a judge's own words pass: a credential-shaped line is dropped whole, a locator in one rewritten. */
function screened(line: string): string {
  if (!line.trim()) return line;
  return automationStudioFlowLessScreenedWords(line).text ?? WITHHELD;
}

function cut(text: string, most: number): string {
  const characters = [...text];
  return characters.length <= most ? text : `${characters.slice(0, most - 1).join("")}…`;
}

function refused(code: string, instruction: string): AutomationStudioLlmEvidenceCompletionCheck {
  return { ok: false, issueCodes: [code], feedback: { code, instruction } };
}
