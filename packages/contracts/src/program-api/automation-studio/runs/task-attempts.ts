// Inputs of the Automation Studio endpoints for a task's attempts: reading
// them, adding budget to one that ran out, and running a task again.

import { z } from "zod/v4";
import { programApiInput, usdAmount } from "../../input/index.ts";

const projectId = z.string().trim().min(1).describe("The project the task belongs to.");
const attemptId = z.string().trim().min(1).describe("The attempt.");

/** `get-task-attempt`: one attempt and how it went. */
export const getTaskAttemptInput = programApiInput(z.object({ projectId, attemptId }));

/** `list-conversation-task-attempts`: every attempt a chat thread holds. */
export const listConversationTaskAttemptsInput = programApiInput(z.object({
  projectId,
  conversationId: z.string().trim().min(1).describe("The chat thread.")
}));

/** `carry-on-task-attempt`: adds budget to an attempt that ran out, and carries on. */
export const carryOnTaskAttemptInput = programApiInput(z.object({
  projectId,
  attemptId,
  addUsd: usdAmount("How many US dollars of budget to add; zero to carry on after an interruption.")
}));

/** `run-task-again`: runs a task again from its last answer. */
export const runTaskAgainInput = programApiInput(z.object({
  projectId,
  taskId: z.string().trim().min(1).describe("The task to run again.")
}));

export type GetTaskAttemptInput = ReturnType<typeof getTaskAttemptInput.parse>;
export type ListConversationTaskAttemptsInput = ReturnType<typeof listConversationTaskAttemptsInput.parse>;
export type CarryOnTaskAttemptInput = ReturnType<typeof carryOnTaskAttemptInput.parse>;
export type RunTaskAgainInput = ReturnType<typeof runTaskAgainInput.parse>;
