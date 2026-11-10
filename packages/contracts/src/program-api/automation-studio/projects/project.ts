// Inputs of the Automation Studio endpoints that list, create, rename and delete projects, and list their problems.

import { z } from "zod/v4";
import { programApiInput } from "../../input/index.ts";

const projectId = z.string().trim().min(1).describe("The project.");

/** `projects`: every project the person can see. */
export const listProjectsInput = programApiInput(z.object({}));

/** `create-project`: a new project. */
export const createProjectInput = programApiInput(z.object({
  name: z.string().trim().min(1).describe("The name of the new project."),
  description: z.string().optional().describe("A short note about what the project is for."),
  categoryId: z.string().trim().min(1).optional().describe("The category to put the project in; leave out for none.")
}));

/** `update-project`: rename a project, change its note or move it to another category. */
export const updateProjectInput = programApiInput(z.object({
  projectId,
  name: z.string().trim().min(1).optional().describe("The new name."),
  description: z.string().optional().describe("The new note about the project."),
  categoryId: z.string().nullable().optional().describe("The category to move the project to; empty or null to take it out of its category.")
}));

/** `delete-project`: a project and everything in it. */
export const deleteProjectInput = programApiInput(z.object({ projectId }));

/** `list-project-problems`: what is wrong in a project, a page at a time. */
export const listProjectProblemsInput = programApiInput(z.object({
  projectId,
  severity: z.string().trim().min(1).optional().describe("Only problems of this severity."),
  source: z.string().trim().min(1).optional().describe("Only problems from this part of the project."),
  status: z.string().trim().min(1).optional().describe("Only problems with this status."),
  scopeId: z.string().trim().min(1).optional().describe("Only problems about this item."),
  search: z.string().trim().min(1).optional().describe("Only problems whose text contains these words."),
  limit: z.number().int().min(1).max(200).optional().describe("The most problems to return in one page."),
  cursor: z.string().optional().describe("The cursor a previous page gave for the next page.")
}));

export type ListProjectsInput = ReturnType<typeof listProjectsInput.parse>;
export type CreateProjectInput = ReturnType<typeof createProjectInput.parse>;
export type UpdateProjectInput = ReturnType<typeof updateProjectInput.parse>;
export type DeleteProjectInput = ReturnType<typeof deleteProjectInput.parse>;
export type ListProjectProblemsInput = ReturnType<typeof listProjectProblemsInput.parse>;
