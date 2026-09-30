// What the result check's verdict says in the chat.
//
// The verdict is shown as the check reached it: Core's own sentence for the
// verdict, then, where the model gave one, what it saw and what it advised --
// the judgement the repair directive already carries, screened and bounded
// there (`repair-directive.ts`) and held once more to what the chat may show
// (`activity/wording/reason-text.ts`). Never the rows themselves, and never a code.

import { automationStudioActivityReasonText } from "../activity/index.ts";
import type { AutomationStudioResultVerificationOutcome } from "./contracts.ts";
import { automationStudioResultVerificationAnswers, automationStudioResultVerificationFailsRun } from "./contracts.ts";

/** Most of a verdict the chat shows: a sentence of Core's and two of the model's, bounded. */
const MAX_TEXT = 600;

/**
 * The check's verdict as a chat row: `label` in a person's words, `status`
 * `succeeded` only for a result judged to answer the request (anything else
 * is not a pass, fail-closed like the verdict itself), and `text` the verdict
 * sentence with the model's own finding and advice where it gave them.
 */
export function automationStudioResultCheckActivity(outcome: AutomationStudioResultVerificationOutcome): { label: string; status: "succeeded" | "failed"; text: string } {
  if (!outcome.performed) return { label: "The result couldn't be checked", status: "failed", text: bounded(outcome.reason) };
  const judgement = outcome.repair?.judgement;
  const text = bounded([
    outcome.reason,
    ...(judgement?.observed ? [`What it found: ${judgement.observed}`] : []),
    ...(judgement?.advice ? [`What to change: ${judgement.advice}`] : [])
  ].join(" "));
  if (automationStudioResultVerificationAnswers(outcome)) return { label: "The result answers the request", status: "succeeded", text };
  return {
    label: automationStudioResultVerificationFailsRun(outcome) ? "The result doesn't answer the request" : "Couldn't confirm the result answers the request",
    status: "failed",
    text
  };
}

function bounded(text: string): string {
  return automationStudioActivityReasonText(text, MAX_TEXT) ?? "";
}
