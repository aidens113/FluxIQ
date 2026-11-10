// Inputs of the Automation Studio endpoints that list and read conversation threads.

import { z } from "zod/v4";
import { programApiInput } from "../../input/index.ts";

const projectId = z.string().trim().min(1).describe("The project the conversation belongs to.");

/** `list-conversations`: the threads in a project, most recently touched first. */
export const listConversationsInput = programApiInput(z.object({
  projectId: projectId.nullable().describe("The project; null for every project the person can see."),
  subjectKind: z.enum(["project", "flow", "build", "run"]).optional().describe("Only threads about this kind of thing; give subjectId with it."),
  subjectId: z.string().trim().min(1).optional().describe("Only threads about this item; give subjectKind with it."),
  status: z.enum(["open", "resolved"]).optional().describe("Only open or only resolved threads."),
  limit: z.number().int().min(1).max(200).optional().describe("The most threads to return.")
}));

/** `get-conversation`: one thread with its turns. */
export const getConversationInput = programApiInput(z.object({
  projectId,
  conversationId: z.string().trim().min(1).describe("The conversation."),
  sinceTurnId: z.string().trim().min(1).optional().describe("Only the turns after this one."),
  limit: z.number().int().min(1).max(500).optional().describe("The most turns to return.")
}));

export type ListConversationsInput = ReturnType<typeof listConversationsInput.parse>;
export type GetConversationInput = ReturnType<typeof getConversationInput.parse>;
