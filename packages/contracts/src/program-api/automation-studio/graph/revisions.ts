// Inputs of the Automation Studio endpoints that show a Flow's saved versions and put one back.

import { z } from "zod/v4";
import { programApiInput } from "../../input/index.ts";

const projectId = z.string().trim().min(1).describe("The project the Flow belongs to.");
const flowId = z.string().trim().min(1).describe("The Flow.");

/** `list-graph-revisions`: the saved versions of a Flow, newest first, with who made each and why. */
export const listGraphRevisionsInput = programApiInput(z.object({
  projectId,
  flowId,
  limit: z.number().int().min(1).max(200).optional().describe("How many versions to return."),
  cursor: z.string().nullish().describe("Where the last list stopped, to continue it.")
}));

/** `create-graph-snapshot`: keeps the Flow as it is now as a restore point. */
export const createGraphSnapshotInput = programApiInput(z.object({
  projectId,
  flowId,
  revisionNumber: z.number().int().min(1).optional().describe("The current version number; only the Flow as it is now can be kept."),
  mutationId: z.string().trim().min(1).optional().describe("A unique id for this request.")
}));

/** `restore-graph-snapshot`: puts a kept version back as a new version. */
export const restoreGraphSnapshotInput = programApiInput(z.object({
  projectId,
  flowId,
  snapshotSha256: z.string().trim().min(1).describe("The restore point of the version to put back, as the version list shows it."),
  mutationId: z.string().trim().min(1).describe("A unique id for this restore, so sending it twice restores once."),
  message: z.string().max(500).optional().describe("A short note for the history, in plain words.")
}));

export type ListGraphRevisionsInput = ReturnType<typeof listGraphRevisionsInput.parse>;
export type CreateGraphSnapshotInput = ReturnType<typeof createGraphSnapshotInput.parse>;
export type RestoreGraphSnapshotInput = ReturnType<typeof restoreGraphSnapshotInput.parse>;
