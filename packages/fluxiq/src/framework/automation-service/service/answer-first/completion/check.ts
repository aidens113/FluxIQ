// A `complete` decision, checked against what the attempt really got (plan D9): the Flow-less
// judge in place of a Flow's test. Order, each stopping there:
//
//   nothing at all to judge            refused, no model call
//   the same evidence as the last no   refused, no model call: new evidence is what it needs
//   one judge call
//     yes                              accepted, and the attempt is achieved
//     no, unsure                       refused with the screened reason; the digest is kept
//     not judged                       refused, the digest not kept: no answer came back
//     refused by the purse             thrown, so the round ends as a budget-out
//
// The summary is built from Core's records, never the model's: rows from the store, acts from
// the act record, the page from a fresh look. `answer` is the one thing of the model's, and it
// is marked as its words wherever it is shown. A judge emits nothing to the chat itself, so
// this says the check, start and end.

import type { AutomationStudioAttemptAct } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioAnswerFirstKeepBackJudge } from "../../../../../runtime/answer-first/attempt-purse/index.ts";
import type { AutomationStudioLlmEvidenceCompletionCheck } from "../../../../../runtime/llm/index.ts";
import { automationStudioFlowLessSummaryDigest, type AutomationStudioFlowLessJudgement, type AutomationStudioFlowLessSummary, type AutomationStudioResultEndView } from "../../../../../runtime/result-verification/index.ts";
import type { AutomationStudioAnswerFirstRowsSummary } from "../rows/index.ts";

const NOTHING = "answer_first.nothing_to_judge";
const SAME = "answer_first.same_evidence";
const JUDGED_NO = "answer_first.judged_no";
const JUDGED_UNSURE = "answer_first.judged_unsure";
const NOT_JUDGED = "answer_first.not_judged";

/** Rows are the summary's own shape, and a rough four characters to a token sizes the judge's hold. */
const CHARS_PER_TOKEN = 4;

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
  /** The last judge's no or unsure, its digest and its words. */
  refused?: { verdict: "no" | "unsure"; digest: string; reason: string } | undefined;
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
  endView(): Promise<AutomationStudioResultEndView | undefined>;
  witnesses(): { before?: JsonObject; after?: JsonObject };
  judge(summary: AutomationStudioFlowLessSummary): Promise<AutomationStudioFlowLessJudgement>;
  purse: Parameters<typeof automationStudioAnswerFirstKeepBackJudge>[0];
  say(title: string, text: string): void;
  seed?: Pick<AutomationStudioAnswerFirstCompletionState, "timesChecked"> | undefined;
}): AutomationStudioAnswerFirstCompletionCheck {
  const state: AutomationStudioAnswerFirstCompletionState = { achieved: false, timesChecked: input.seed?.timesChecked ?? 0, purseRefused: false };
  return {
    state,
    check: async (result) => {
      const answerText = typeof result.answer === "string" && result.answer.trim() ? result.answer.trim() : undefined;
      if (answerText !== undefined) state.answerText = answerText;
      const rows = await input.rows();
      const acts = input.acts();
      if (rows.totalRows === 0 && acts.length === 0 && answerText === undefined) return refused(NOTHING, "You have nothing to check yet: no read has returned a row, no lasting act is on the record, and you gave no answer. Get the result first, and complete when you have it.");
      const summary = await summaryOf(input, rows, acts, answerText);
      const digest = automationStudioFlowLessSummaryDigest(summary);
      if (state.refused?.digest === digest) return refused(SAME, `This is the same evidence that was already checked, and it was refused: ${state.refused.reason} Get something new before you complete again.`);
      automationStudioAnswerFirstKeepBackJudge(input.purse, { summaryInputTokens: Math.ceil(JSON.stringify(summary).length / CHARS_PER_TOKEN) });
      input.say("Checking the result", "Checking what I have against what you asked for.");
      const judged = await input.judge(summary);
      if (judged.refusedByPurse) {
        state.purseRefused = true;
        throw new AutomationStudioAnswerFirstJudgeRefusedByPurse(judged.reason);
      }
      if (judged.verdict === "not_judged") {
        input.say("The check did not answer", judged.reason);
        return refused(NOT_JUDGED, `${judged.reason} Complete again when you are ready, or carry on if there is more to get.`);
      }
      state.timesChecked += 1;
      state.checkedWhat = judged.checkedWhat;
      if (judged.verdict === "yes") {
        state.achieved = true;
        state.refused = undefined;
        input.say("Checked", "It is what you asked for, checked once.");
        return { ok: true };
      }
      state.refused = { verdict: judged.verdict, digest, reason: judged.reason };
      input.say(judged.verdict === "no" ? "Not there yet" : "Could not confirm it yet", "The check did not confirm this yet, so I am carrying on.");
      return refused(judged.verdict === "no" ? JUDGED_NO : JUDGED_UNSURE, judged.reason);
    }
  };
}

async function summaryOf(input: Parameters<typeof automationStudioAnswerFirstCompletionCheck>[0], rows: AutomationStudioAnswerFirstRowsSummary, acts: readonly AutomationStudioAttemptAct[], answerText: string | undefined): Promise<AutomationStudioFlowLessSummary> {
  const endView = await input.endView();
  const witnesses = input.witnesses();
  return {
    instructions: input.instructions,
    ...(rows.datasetId !== undefined ? { rows: { totalRows: rows.totalRows, truncated: rows.truncated, columns: rows.columns, rows: rows.rows } } : {}),
    acts,
    ...(answerText !== undefined ? { answerText } : {}),
    ...(endView ? { endView } : {}),
    ...(Object.keys(witnesses).length ? { witnesses } : {})
  };
}

function refused(code: string, instruction: string): AutomationStudioLlmEvidenceCompletionCheck {
  return { ok: false, issueCodes: [code], feedback: { code, instruction } };
}
