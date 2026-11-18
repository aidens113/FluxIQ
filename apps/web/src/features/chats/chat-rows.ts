import type { Conversation } from "../automation-studio/conversation/thread";
import { chatHref } from "./chat-href";

export type ChatRow = {
  conversationId: string;
  title: string;
  projectId: string;
  projectName: string;
  status: "open" | "resolved";
  turns: number;
  waiting: number;
  updatedAt: number;
  href: string;
};

/** The chats a list shows, newest first, each with its project's name and the address that opens it. */
export function chatRows(conversations: readonly Conversation[], projectNames: ReadonlyMap<string, string>, search = ""): ChatRow[] {
  const needle = search.trim().toLocaleLowerCase();
  return conversations
    .map((chat): ChatRow => ({
      conversationId: chat.conversationId,
      title: chat.title?.trim() || "Untitled chat",
      projectId: chat.projectId,
      projectName: projectNames.get(chat.projectId) ?? chat.projectId,
      status: chat.status,
      turns: chat.turnCount,
      waiting: chat.pendingAskCount,
      updatedAt: chat.updatedAt,
      href: chatHref(chat.conversationId, chat.projectId)
    }))
    .filter((row) => !needle || row.title.toLocaleLowerCase().includes(needle) || row.projectName.toLocaleLowerCase().includes(needle))
    .sort((left, right) => right.updatedAt - left.updatedAt);
}
