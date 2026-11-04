import type { AutomationStudioTaskOutcome } from "../../../../../api-contracts/automation.ts";
import { automationStudioAnswerFirstOutcomeOfRecord } from "./outcome-of-record.ts";
import type { AutomationStudioAnswerFirstAttemptStore } from "./store.ts";

/**
 * A thread's outcomes, oldest first: every attempt that started while the thread held its Flow
 * (`./locator.ts`), whatever it has come to, a working row included. None is an empty list. A file
 * that is there and cannot be read throws, so it is never told as a thread with nothing in it.
 */
export async function automationStudioAnswerFirstOutcomesOfConversation(store: AutomationStudioAnswerFirstAttemptStore, projectId: string, conversationId: string): Promise<AutomationStudioTaskOutcome[]> {
  const held = await store.locator.flowsOfConversation(projectId, conversationId);
  const outcomes: AutomationStudioTaskOutcome[] = [];
  for (const flowId of new Set(held.map((flow) => flow.flowId))) {
    const spans = held.filter((flow) => flow.flowId === flowId);
    const records = await store.list(projectId, flowId);
    records.forEach((record, at) => {
      const started = record.attempt.startedAtMs;
      if (spans.some((span) => started >= span.sinceMs && (span.untilMs === undefined || started < span.untilMs))) outcomes.push(automationStudioAnswerFirstOutcomeOfRecord(records, at, flowId));
    });
  }
  return outcomes.sort((one, other) => one.attempt.startedAtMs - other.attempt.startedAtMs);
}
