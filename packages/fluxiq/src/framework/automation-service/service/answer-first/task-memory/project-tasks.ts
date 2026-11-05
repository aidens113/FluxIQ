import type { AutomationStudioProjectTask } from "../../../../../api-contracts/automation.ts";
import { automationStudioAnswerFirstOutcomeOfAttempt, type AutomationStudioAnswerFirstOutcomeSource } from "../attempt-store/index.ts";
import type { AutomationStudioAnswerFirstTaskMemoryStore } from "./store.ts";

/** What a project's task list reads through: the tasks' memory, their attempts, each Flow's name, and the thread that holds a Flow. */
export type AutomationStudioAnswerFirstProjectTasksPorts = {
  memory: Pick<AutomationStudioAnswerFirstTaskMemoryStore, "list">;
  source: AutomationStudioAnswerFirstOutcomeSource;
  flowNames: ReadonlyMap<string, string>;
};

/**
 * Every task the project remembers with its latest attempt, newest first. A task whose latest attempt cannot be found
 * is left out. An attempt file that is there and cannot be read throws, so a list is never told as shorter than it is.
 */
export async function automationStudioAnswerFirstProjectTasks(ports: AutomationStudioAnswerFirstProjectTasksPorts, projectId: string): Promise<AutomationStudioProjectTask[]> {
  const tasks: AutomationStudioProjectTask[] = [];
  for (const memory of await ports.memory.list(projectId)) {
    const newest = [...memory.attempts].sort((a, b) => b.ordinal - a.ordinal)[0];
    const latest = newest ? await automationStudioAnswerFirstOutcomeOfAttempt(ports.source, projectId, newest.attemptId) : undefined;
    if (!latest) continue;
    const flowId = latest.attempt.flowId ?? memory.flowId;
    const title = memory.title ?? ports.flowNames.get(flowId)?.trim();
    const conversationId = await ports.source.locator.conversationOfFlow(projectId, flowId);
    tasks.push({ taskId: memory.taskId, flowId, ...(title ? { title } : {}), ...(conversationId ? { conversationId } : {}), attemptCount: memory.attempts.length, latest });
  }
  return tasks.sort((one, other) => other.latest.attempt.startedAtMs - one.latest.attempt.startedAtMs);
}
