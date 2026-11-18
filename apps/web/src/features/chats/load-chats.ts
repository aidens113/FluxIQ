import type { ProgramCommandTransport } from "../automation-studio/data/program-transport";
import { listConversations, parseConversations, type Conversation } from "../automation-studio/conversation";

/** Chats read at a time; "Show older chats" asks for this many more. */
export const CHATS_PAGE_SIZE = 25;

/** Every chat of one project (or of all the person can see when `projectId` is null), whatever its status. Throws with Core's words when it cannot be read. */
export async function loadChats(studio: ProgramCommandTransport, projectId: string | null, limit: number, signal: AbortSignal): Promise<Conversation[]> {
  const answer = await listConversations(studio, { projectId, limit }, signal);
  if (!answer.ok) throw new Error(answer.error ?? "The chats could not be read.");
  return parseConversations(answer.payload?.conversations);
}
