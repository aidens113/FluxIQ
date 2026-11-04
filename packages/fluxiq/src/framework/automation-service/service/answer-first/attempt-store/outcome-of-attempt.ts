import type { AutomationStudioTaskOutcome } from "../../../../../api-contracts/automation.ts";
import { automationStudioAnswerFirstOutcomeOfRecord } from "./outcome-of-record.ts";
import type { AutomationStudioAnswerFirstOutcomeSource } from "./outcome-source.ts";

/**
 * One attempt's outcome by its id, or none where nothing says where it is. A file that is there and
 * cannot be read throws, so it is never told as an attempt that does not exist.
 */
export async function automationStudioAnswerFirstOutcomeOfAttempt(store: AutomationStudioAnswerFirstOutcomeSource, projectId: string, attemptId: string): Promise<AutomationStudioTaskOutcome | undefined> {
  const flowId = await store.locator.flowOfAttempt(projectId, attemptId);
  if (flowId === undefined) return undefined;
  const records = await store.list(projectId, flowId);
  const at = records.findIndex((record) => record.attempt.attemptId === attemptId);
  return at < 0 ? undefined : automationStudioAnswerFirstOutcomeOfRecord(records, at, flowId);
}
