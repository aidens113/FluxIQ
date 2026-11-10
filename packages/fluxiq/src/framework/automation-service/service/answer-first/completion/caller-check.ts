// A caller's own check of a completion (`AutomationStudioAnswerFirstCallerCheck`; fluxnode-plan N4),
// asked once and read as a pass or a no with its reason. It runs in the caller's code, so it is held
// as anything foreign is: it gets its own copy of the summary, a reason is bounded, and a check that
// throws, or answers anything but `true` or words, is a no. A no only sends the attempt round again,
// so a faulty check costs rounds and never ends the task (the hard rule: result, budget or Stop).

import type { AutomationStudioFlowLessSummary } from "../../../../../runtime/result-verification/index.ts";
import type { AutomationStudioAnswerFirstCallerCheck } from "../../flow-bootstrap-commands/index.ts";

/** The most of a reason the model is shown, by code point. */
const REASON_CHARS = 1_000;
const NO_REASON = "The caller's check of this result did not pass, and it gave no reason.";

export type AutomationStudioAnswerFirstCallerCheckAnswer = { pass: true } | { pass: false; reason: string };

export async function automationStudioAnswerFirstCallerCheckAnswer(check: AutomationStudioAnswerFirstCallerCheck, summary: AutomationStudioFlowLessSummary): Promise<AutomationStudioAnswerFirstCallerCheckAnswer> {
  let said: unknown;
  try {
    said = await check(structuredClone(summary));
  } catch (error) {
    const named = error instanceof Error ? `${error.name}: ${error.message}` : "an error";
    return { pass: false, reason: cut(`The caller's check of this result failed with ${named}`) };
  }
  if (said === true) return { pass: true };
  return { pass: false, reason: typeof said === "string" && said.trim() ? cut(said.trim()) : NO_REASON };
}

function cut(text: string): string {
  const characters = [...text];
  return characters.length <= REASON_CHARS ? text : `${characters.slice(0, REASON_CHARS - 1).join("")}…`;
}
