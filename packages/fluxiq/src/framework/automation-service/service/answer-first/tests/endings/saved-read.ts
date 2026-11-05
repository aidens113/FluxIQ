// What a person is told of an ending through `get-task-attempt`: the same read the route makes, over
// the service's own stores, plus the task's memory, where the notes and the best Flow are kept.

import { automationStudioAnswerFirstAttemptsRead, automationStudioAnswerFirstAttemptStoreOf, automationStudioAnswerFirstOutcomeOfAttempt, automationStudioAnswerFirstTaskMemoryOf } from "../../index.ts";
import type { Attempt } from "./support.ts";
import { answerOf } from "./support.ts";

/** What the route reads through: the service's own attempt store, with a row whose Core died read as interrupted (`programs/.../task/attempt-store.ts`, restated since a framework test may not import a program). */
function outcomeSource(service: object) {
  const owned = service as unknown as { projectPaths: never; flowPaths: never; projects: never };
  const stores = { paths: owned.projectPaths, flows: owned.flowPaths, projects: owned.projects };
  return { locator: automationStudioAnswerFirstAttemptStoreOf(service, stores).locator, list: automationStudioAnswerFirstAttemptsRead(service, stores).list };
}

/** The outcome the card is drawn from. */
export async function outcomeRead(attempt: Pick<Attempt, "service" | "projectId" | "answered">) {
  const { attemptId } = answerOf(attempt as Attempt).attempt;
  const outcome = await automationStudioAnswerFirstOutcomeOfAttempt(outcomeSource(attempt.service), attempt.projectId, attemptId);
  if (!outcome) throw new Error("the attempt could not be read back");
  return outcome;
}

/** What the task kept: its best Flow's steps, and its notes. */
export async function taskKept(attempt: Pick<Attempt, "service" | "projectId" | "answered">) {
  const { taskId } = answerOf(attempt as Attempt).attempt;
  const owned = attempt.service as unknown as { projectPaths: never; projects: never };
  return await automationStudioAnswerFirstTaskMemoryOf(attempt.service, { paths: owned.projectPaths, projects: owned.projects }).get(attempt.projectId, taskId);
}
