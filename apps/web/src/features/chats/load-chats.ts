import type { ProgramCommandTransport } from "../automation-studio/data/program-transport";
import { parsePanelThreads } from "./parse-panel-threads";
import { listConversations, parseConversations, type Conversation } from "../automation-studio/conversation";

/** Chats read at a time; "Show older chats" asks for this many more. */
export const CHATS_PAGE_SIZE = 25;

/**
 * Every chat of one project (or of all the person can see when `projectId` is null), whatever its
 * status. The person's earlier chats from before every chat had a project (`list-panel-threads`)
 * belong to no project, so they join only the all-projects list, still readable where they live.
 * Throws with Core's words when a list cannot be read.
 */
export async function loadChats(studio: ProgramCommandTransport, projectId: string | null, limit: number, signal: AbortSignal): Promise<Conversation[]> {
  const [projectChats, panelThreads] = await Promise.all([
    listConversations(studio, { projectId, limit }, signal),
    projectId === null ? studio.post<{ conversations?: unknown }>("list-panel-threads", { limit }, { signal }) : null
  ]);
  if (!projectChats.ok) throw new Error(projectChats.error ?? "The chats could not be read.");
  if (panelThreads && !panelThreads.ok) throw new Error(panelThreads.error ?? "The earlier chats could not be read.");
  const seen = new Set<string>();
  return [...parseConversations(projectChats.payload?.conversations), ...parsePanelThreads(panelThreads?.payload?.conversations)]
    .filter((chat) => !seen.has(chat.conversationId) && seen.add(chat.conversationId));
}
