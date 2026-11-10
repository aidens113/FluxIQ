// Inputs of the Automation Studio endpoints that read, rename and delete a project's recordings.

import { z } from "zod/v4";
import { programApiInput } from "../../input/index.ts";

const projectId = z.string().trim().min(1).describe("The project the recording belongs to.");
const recordingId = z.string().trim().min(1).describe("The recording.");

/** `get-recording-capture-policy`: what a recording may capture. */
export const getRecordingCapturePolicyInput = programApiInput(z.object({
  projectId: projectId.nullable().optional().describe("The project; leave out for the rule that applies everywhere.")
}));

/** `get-recording`: one recording with the steps it captured. */
export const getRecordingInput = programApiInput(z.object({ projectId, recordingId }));

/** `update-recording`: rename a recording, change its note, or archive it. */
export const updateRecordingInput = programApiInput(z.object({
  projectId,
  recordingId,
  name: z.string().trim().min(1).optional().describe("The new name."),
  description: z.string().trim().min(1).optional().describe("The new note about what was recorded."),
  archived: z.boolean().optional().describe("True to archive the recording, false to bring it back.")
}));

/** `delete-recording`: one recording and the proposals made from it. */
export const deleteRecordingInput = programApiInput(z.object({ projectId, recordingId }));

/** `delete-recordings`: several recordings at once. */
export const deleteRecordingsInput = programApiInput(z.object({
  projectId,
  recordingIds: z.array(z.string().trim().min(1)).min(1).describe("The recordings to delete.")
}));

export type GetRecordingCapturePolicyInput = ReturnType<typeof getRecordingCapturePolicyInput.parse>;
export type GetRecordingInput = ReturnType<typeof getRecordingInput.parse>;
export type UpdateRecordingInput = ReturnType<typeof updateRecordingInput.parse>;
export type DeleteRecordingInput = ReturnType<typeof deleteRecordingInput.parse>;
export type DeleteRecordingsInput = ReturnType<typeof deleteRecordingsInput.parse>;
