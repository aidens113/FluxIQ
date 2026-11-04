// An attempt's ending, checked before it is stored or told: whoever writes one calls
// this (`checkAutomationStudioTaskAttemptResult`, the contract's own rule).
//
// **A true contradiction throws, and nothing else may.** `achieved` with anything but a
// confirmed result, a budget-out labelled confirmed or of a kind it may not be, or
// another attempt's result: each is a programming error, and a typed one.
//
// **A budget-out with nothing still ends.** It is the one failure ending there is, and
// it must not fail for having found nothing, so none is written as the empty `partial`
// the contract asks for. A result that does not parse is written again by the writer,
// smaller and unverified, keeping its acts, for the same reason: it can then only
// claim an `achieved` that the check refuses, and rightly.

import {
  checkAutomationStudioTaskAttemptResult,
  parseAutomationStudioTaskAttempt,
  parseAutomationStudioTaskResult,
  type AutomationStudioAttemptAct,
  type AutomationStudioTaskAttempt,
  type AutomationStudioTaskResult
} from "@fluxiq/contracts/automation";
import { AutomationStudioAnswerFirstEndingError } from "./ending-error.ts";
import { automationStudioAnswerFirstResult } from "./result.ts";

export function automationStudioAnswerFirstEnding(input: { attempt: AutomationStudioTaskAttempt; result: AutomationStudioTaskResult | undefined }): { attempt: AutomationStudioTaskAttempt; result: AutomationStudioTaskResult | undefined } {
  const parsed = parseAutomationStudioTaskAttempt(input.attempt);
  if (!parsed.ok) throw new AutomationStudioAnswerFirstEndingError(parsed.issues);
  const { attempt } = parsed;
  const result = endingResult(attempt, input.result);
  const check = checkAutomationStudioTaskAttemptResult(attempt, result);
  if (!check.ok) throw new AutomationStudioAnswerFirstEndingError(check.issues);
  return { attempt, result };
}

function endingResult(attempt: AutomationStudioTaskAttempt, given: AutomationStudioTaskResult | undefined): AutomationStudioTaskResult | undefined {
  if (given === undefined) return attempt.status === "budget_out" ? automationStudioAnswerFirstResult({ attemptId: attempt.attemptId, label: "unverified", timesChecked: 0, acts: [] }) : undefined;
  const parsed = parseAutomationStudioTaskResult(given);
  if (parsed.ok) return parsed.result;
  const acts: readonly AutomationStudioAttemptAct[] = Array.isArray(given.acts) ? given.acts : [];
  return automationStudioAnswerFirstResult({ attemptId: attempt.attemptId, label: "unverified", timesChecked: 0, acts });
}
