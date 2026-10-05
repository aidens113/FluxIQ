// What the result check's verdict says in the chat.
//
// The card is said in the person's words: how many rows came back, Core's own
// sentence for the verdict, then, on a refusal, what the check looked for and
// what it found -- each of the check's sentences shown only when it names
// nothing internal (`check-words.ts`). The check's advice is never shown: it is
// for the repair, and it is where the step's parameter names and node ids live
// (t194-w81, U6: live run musp39u8 showed "Raise extractList.paginate.maxPages on
// node.bootstrap.….main.s7" and never the 13 rows). The run record and the
// repair's inputs are unchanged; only the card's words are chosen here. Never
// the rows themselves, and never a code.

import { ACTIVITY_RESULT_CHECK_LABELS } from "../../../../ui/index.ts";
import { automationStudioActivityInBuild, automationStudioActivityReasonText } from "../activity/index.ts";
import type { AutomationStudioResultVerificationOutcome } from "./contracts.ts";
import { automationStudioResultVerificationAnswers, automationStudioResultVerificationFailsRun } from "./contracts.ts";
import { automationStudioResultCheckWords } from "./check-words.ts";
import { AUTOMATION_STUDIO_RESULT_UNSETTLED_WORDS as UNSETTLED } from "./unsettled/index.ts";

/** Most of a verdict the chat shows: the row count, a sentence of Core's and the check's reading, bounded. */
const MAX_TEXT = 600;

/**
 * The check's verdict as a chat row: `label` in a person's words, `status`
 * `succeeded` only for a result judged to answer the request (anything else
 * is not a pass, fail-closed like the verdict itself), and `text` the rows that
 * came back, the verdict sentence and, on a refusal, the check's reading in
 * plain words (`automationStudioResultCheckWords`). The
 * labels are the chat's (`ACTIVITY_RESULT_CHECK_LABELS`): a card reads a result
 * not confirmed, or not checked, from its label and says so rather than
 * "didn't pass", since `status` is `failed` for both.
 *
 * Inside a build, checks that did not settle close on what that means there,
 * that the build cannot finish on this test, rather than that the run is not
 * failed for it (`./unsettled/unsettled-words.ts`; t193 1003, D10).
 */
export function automationStudioResultCheckActivity(outcome: AutomationStudioResultVerificationOutcome): { label: string; status: "succeeded" | "failed"; text: string } {
  if (!outcome.performed) return { label: ACTIVITY_RESULT_CHECK_LABELS.unchecked, status: "failed", text: bounded(outcome.reason) };
  const text = bounded(automationStudioResultCheckWords({ ...outcome, reason: saidHere(outcome) }));
  if (automationStudioResultVerificationAnswers(outcome)) return { label: ACTIVITY_RESULT_CHECK_LABELS.answers, status: "succeeded", text };
  return {
    label: automationStudioResultVerificationFailsRun(outcome) ? ACTIVITY_RESULT_CHECK_LABELS.refuted : ACTIVITY_RESULT_CHECK_LABELS.unconfirmed,
    status: "failed",
    text
  };
}

/** The verdict's sentence, its closing sentence a build's when it did not settle and is said inside a build. */
function saidHere(outcome: Extract<AutomationStudioResultVerificationOutcome, { performed: true }>): string {
  const basis = outcome.basis;
  if ((basis !== "model_disagreed" && basis !== "model_unconfirmed") || !automationStudioActivityInBuild()) return outcome.reason;
  const words = UNSETTLED[basis];
  return outcome.reason.endsWith(words.run) ? `${outcome.reason.slice(0, -words.run.length)}${words.build}` : outcome.reason;
}

function bounded(text: string): string {
  return automationStudioActivityReasonText(text, MAX_TEXT) ?? "";
}
