// Inputs of the Automation Studio endpoints for a project's tasks: listing
// them, renaming one and forgetting one.

import { z } from "zod/v4";
import { programApiInput } from "../../input/index.ts";

const projectId = z.string().trim().min(1).describe("The project the task belongs to.");
const taskId = z.string().trim().min(1).describe("The task.");

/** `list-project-tasks`: a page of the project's tasks with each one's latest attempt. */
export const listProjectTasksInput = programApiInput(z.object({
  projectId,
  limit: z.number().int().min(1).max(100).optional().describe("The most tasks to return in one page; 50 when left out."),
  cursor: z.string().optional().describe("The cursor a previous page gave for the next page.")
}));

/** `rename-task`: gives a task a new name. */
export const renameTaskInput = programApiInput(z.object({
  projectId,
  taskId,
  title: z.string().trim().min(1).max(120).describe("The new name, in plain words.")
}));

/** `remove-task`: forgets a task's notes and remembered steps; its Flow and results stay. */
export const removeTaskInput = programApiInput(z.object({ projectId, taskId }));

export type ListProjectTasksInput = ReturnType<typeof listProjectTasksInput.parse>;
export type RenameTaskInput = ReturnType<typeof renameTaskInput.parse>;
export type RemoveTaskInput = ReturnType<typeof removeTaskInput.parse>;
