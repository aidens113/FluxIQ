// One kept attempt as what a person is told of it, through the contract's parsers (t869): a record
// that does not read, or an attempt and result that disagree, is a read that failed, and never a guess.

import { checkAutomationStudioTaskAttemptResult, parseAutomationStudioSavedState, parseAutomationStudioTaskAttempt, parseAutomationStudioTaskResult, type AutomationStudioSavedState, type AutomationStudioTaskAttempt } from "@fluxiq/contracts/automation";
import { automationStudioFlowDraftStepIsProposed } from "../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioTaskOutcome } from "../../../../../api-contracts/automation.ts";
import { automationStudioAnswerFirstKeptState } from "../task-memory/kept-state.ts";
import { automationStudioAnswerFirstLeftOutSteps } from "../task-memory/left-out-steps.ts";
import { automationStudioAnswerFirstStepsDigest } from "../task-memory/steps-digest.ts";
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
  const saved = savedOf(record, attempt, flowId);
  if (saved) outcome.saved = saved;
  const earlier = records.slice(0, at).filter((each) => each.attempt.taskId === attempt.taskId && each.attempt.endedAtMs !== undefined).at(-1);
  if (earlier) outcome.comparedTo = attemptOf(earlier.attempt, flowId);
  return outcome;
}

function attemptOf(value: unknown, flowId: string): AutomationStudioTaskAttempt {
  const read = parseAutomationStudioTaskAttempt(value);
  if (!read.ok) throw new AutomationStudioAnswerFirstAttemptsUnreadable(flowId);
  return read.attempt;
}

/**
 * What the record says is kept. A draft saved through the candidate store is steps kept and unproven; steps the
 * attempt wrote that could not be assembled into one are kept on the row all the same and read as notes, which is
 * true of them; an attempt that wrote no step of its own has nothing saved. (Cause of t869's "Nothing saved yet":
 * this read `candidateId` alone, so an ending whose draft did not assemble read as nothing at all.)
 *
 * A step that did something lasting and is out of the saved Flow is named on `leftOut`, so the line says the Flow lacks it.
 *
 * Saved steps carry their digest, the task memory's name for them, so a later attempt's
 * `startedFrom` can be held against exactly this.
 *
 * A whole run of the saved Flow judged yes, with nothing worked out after it, is what makes steps `ready`, as the task's memory
 * says (`../task-memory/saved-state.ts`). Before this read it too, the answer said "They have not run on their own yet" under the
 * run that had just done so.
 */
function savedOf(record: AutomationStudioAnswerFirstAttemptRecord, attempt: AutomationStudioTaskAttempt, flowId: string): AutomationStudioSavedState | undefined {
  const kept = automationStudioAnswerFirstKeptState({ steps: record.steps?.some(automationStudioFlowDraftStepIsProposed) === true, assembled: record.candidateId !== undefined });
  if (kept === undefined) return undefined;
  if (kept === "partly_works") return draftSavedOf(attempt, flowId, automationStudioAnswerFirstStepsDigest(record.steps?.filter(automationStudioFlowDraftStepIsProposed) ?? []), automationStudioAnswerFirstLeftOutSteps(record.steps ?? []));
  const read = parseAutomationStudioSavedState({ state: "notes_only", trust: "unproven", savedAtMs: attempt.endedAtMs ?? attempt.startedAtMs });
  if (!read.ok) throw new AutomationStudioAnswerFirstAttemptsUnreadable(flowId);
  return read.saved;
}

function draftSavedOf(attempt: AutomationStudioTaskAttempt, flowId: string, stepsDigest: string, leftOut: readonly string[]): AutomationStudioSavedState {
  const atMs = attempt.endedAtMs ?? attempt.startedAtMs;
  const provenWhole = attempt.path === "run_flow" && attempt.status === "achieved" && attempt.liveSteps > 0;
  const fields: Record<string, unknown> = provenWhole ? { state: "ready", trust: "provisional", flowId, savedAtMs: atMs, lastWorkedAtMs: atMs, stepsDigest } : { state: "partly_works", trust: "unproven", flowId, savedAtMs: atMs, stepsDigest };
  if (attempt.simulation && !provenWhole) fields.simulation = attempt.simulation.verdict;
  // The saved run stopped at a step that was repaired live: the steps ran, so the line must not say they have not (t878).
  if (attempt.path === "run_flow_then_repair" && attempt.status === "achieved") fields.repaired = true;
  if (leftOut.length > 0) fields.leftOut = [...leftOut];
  const read = parseAutomationStudioSavedState(fields);
  if (!read.ok) throw new AutomationStudioAnswerFirstAttemptsUnreadable(flowId);
  return read.saved;
}
