// Inputs of the Automation Studio endpoints that show a project's overview and recordings.

import { z } from "zod/v4";
import { programApiInput } from "../../input/index.ts";

const projectId = z.string().trim().min(1).describe("The project.");

/** `get-project-workspace-summary`: one project's overview. */
export const getProjectWorkspaceSummaryInput = programApiInput(z.object({ projectId }));

/** `list-recordings`: the recordings in a project. */
export const listRecordingsInput = programApiInput(z.object({
  projectId: projectId.optional().describe("The project; leave out for every project the person can see."),
  summaries: z.boolean().optional().describe("True for a short line about each recording instead of all of it."),
  limit: z.number().int().min(1).max(500).optional().describe("The most results to return; used with summaries."),
  offset: z.number().int().min(0).optional().describe("How many results to skip, for the next page; used with summaries.")
}));

export type GetProjectWorkspaceSummaryInput = ReturnType<typeof getProjectWorkspaceSummaryInput.parse>;
export type ListRecordingsInput = ReturnType<typeof listRecordingsInput.parse>;
