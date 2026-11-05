// One kept attempt as what a person is told of it, through the contract's parsers (t869): a record
// that does not read, or an attempt and result that disagree, is a read that failed, and never a guess.

import { checkAutomationStudioTaskAttemptResult, parseAutomationStudioSavedState, parseAutomationStudioTaskAttempt, parseAutomationStudioTaskResult, type AutomationStudioSavedState, type AutomationStudioTaskAttempt } from "@fluxiq/contracts/automation";
import type { AutomationStudioTaskOutcome } from "../../../../../api-contracts/automation.ts";
import type { AutomationStudioAnswerFirstAttemptRecord } from "./record.ts";
import { AutomationStudioAnswerFirstAttemptsUnreadable } from "./unreadable.ts";

/**
 * The outcome of the attempt at `at` in a Flow's list, oldest first. `saved` is what the record
 * says: a draft saved through the candidate store is steps kept and unproven (plan, D4), and no
 * draft says nothing. `comparedTo` is the latest earlier attempt at the same task on this Flow that
 * ended: a different task's time, or a row still going, is nothing to compare with.
 */
export function automationStudioAnswerFirstOutcomeOfRecord(records: readonly AutomationStudioAnswerFirstAttemptRecord[], at: number, flowId: string): AutomationStudioTaskOutcome {
  const record = records[at];
  if (!record) throw new AutomationStudioAnswerFirstAttemptsUnreadable(flowId);
  const attempt = attemptOf(record.attempt, flowId);
  const outcome: AutomationStudioTaskOutcome = { attempt };
  if (record.result !== undefined) {
    const result = parseAutomationStudioTaskResult(record.result);
    if (!result.ok) throw new AutomationStudioAnswerFirstAttemptsUnreadable(flowId);
    outcome.result = result.result;
  }
  if (!checkAutomationStudioTaskAttemptResult(attempt, outcome.result).ok) throw new AutomationStudioAnswerFirstAttemptsUnreadable(flowId);
  if (record.candidateId !== undefined) outcome.saved = savedOf(attempt, flowId);
  const earlier = records.slice(0, at).filter((each) => each.attempt.taskId === attempt.taskId && each.attempt.endedAtMs !== undefined).at(-1);
  if (earlier) outcome.comparedTo = attemptOf(earlier.attempt, flowId);
  return outcome;
}

function attemptOf(value: unknown, flowId: string): AutomationStudioTaskAttempt {
  const read = parseAutomationStudioTaskAttempt(value);
  if (!read.ok) throw new AutomationStudioAnswerFirstAttemptsUnreadable(flowId);
  return read.attempt;
}

function savedOf(attempt: AutomationStudioTaskAttempt, flowId: string): AutomationStudioSavedState {
  const fields: Record<string, unknown> = { state: "partly_works", trust: "unproven", flowId, savedAtMs: attempt.endedAtMs ?? attempt.startedAtMs };
  if (attempt.simulation) fields.simulation = attempt.simulation.verdict;
  const read = parseAutomationStudioSavedState(fields);
  if (!read.ok) throw new AutomationStudioAnswerFirstAttemptsUnreadable(flowId);
  return read.saved;
}
