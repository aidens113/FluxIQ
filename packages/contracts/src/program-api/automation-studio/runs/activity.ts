// Input of the Automation Studio endpoint that reads what a project is doing now.

import { z } from "zod/v4";
import { programApiInput } from "../../input/index.ts";

/** `get-activity`: the latest thing a project is doing, and the events before it. */
export const getActivityInput = programApiInput(z.object({
  projectId: z.string().trim().min(1).describe("The project to read live activity for.")
}));

export type GetActivityInput = ReturnType<typeof getActivityInput.parse>;
