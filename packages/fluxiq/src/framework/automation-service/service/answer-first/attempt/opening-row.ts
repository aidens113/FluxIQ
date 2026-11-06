// A new attempt's place in its task's memory, written at once (design, "Task memory"): a client
// holding only an attempt's id can then find its task and Flow while it is still running, and a
// process that dies leaves it counted. Best effort: its ending writes this again, and says so if
// that fails.

import { automationStudioAnswerFirstBestEffort } from "./best-effort.ts";
import type { AutomationStudioAnswerFirstAttemptRun } from "./state.ts";

export async function automationStudioAnswerFirstRecordOpening(run: AutomationStudioAnswerFirstAttemptRun): Promise<void> {
  const { projectId, flowId } = run.input;
  await automationStudioAnswerFirstBestEffort(() => run.memory.update(projectId, run.taskId, (current) => ({
    ...current,
    flowId,
    ...(run.input.startLocation !== undefined ? { startLocation: run.input.startLocation } : {}),
    attempts: [...current.attempts, { attemptId: run.attemptId, flowId, ordinal: run.ordinal, route: run.route.kind, ...(run.askedAgain ? { askedAgain: true as const } : {}), ...(run.startedFrom ? { startedFrom: run.startedFrom } : {}), steps: [] }]
  })));
}
