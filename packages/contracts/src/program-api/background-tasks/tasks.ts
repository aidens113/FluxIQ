// Inputs of the Background Tasks endpoints the panel assistant may read.

import { z } from "zod/v4";
import { programApiInput } from "../input/index.ts";

/** `snapshot`: the engine's background tasks and their last runs. Takes nothing. */
export const backgroundTasksSnapshotInput = programApiInput(z.object({}));

/** `detail`: one background task with a page of its runs. */
export const backgroundTaskDetailInput = programApiInput(z.object({
  taskId: z.string().trim().min(1).describe("The background task to look at."),
  limit: z.number().int().min(1).max(100).optional().describe("How many runs to return, at most 100. Leave it out for 50."),
  offset: z.number().int().min(0).optional().describe("How many of the newest runs to skip. Leave it out to start from the newest."),
  status: z.enum(["queued", "running", "succeeded", "failed", "cancelled", "all"]).optional().describe("Only runs in this state. Leave it out for every run.")
}));
