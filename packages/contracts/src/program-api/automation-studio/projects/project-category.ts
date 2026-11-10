// Inputs of the Automation Studio endpoints that create, rename and delete the categories projects are grouped in.

import { z } from "zod/v4";
import { programApiInput } from "../../input/index.ts";

const categoryId = z.string().trim().min(1).describe("The category.");

/** `create-project-category`: a new category. */
export const createProjectCategoryInput = programApiInput(z.object({
  name: z.string().trim().min(1).describe("The name of the new category.")
}));

/** `update-project-category`: rename a category. */
export const updateProjectCategoryInput = programApiInput(z.object({
  categoryId,
  name: z.string().trim().min(1).describe("The new name.")
}));

/** `delete-project-category`: a category; its projects stay, without a category. */
export const deleteProjectCategoryInput = programApiInput(z.object({ categoryId }));

export type CreateProjectCategoryInput = ReturnType<typeof createProjectCategoryInput.parse>;
export type UpdateProjectCategoryInput = ReturnType<typeof updateProjectCategoryInput.parse>;
export type DeleteProjectCategoryInput = ReturnType<typeof deleteProjectCategoryInput.parse>;
