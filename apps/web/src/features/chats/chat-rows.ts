import type { Conversation } from "../automation-studio/conversation/thread";
import { chatHref } from "./chat-href";
import { PANEL_PROJECT } from "./parse-panel-threads";

const EARLIER = "No project (an earlier chat)";

/** What a chat is called when nobody named it and FluxIQ has not: the day it was last used. */
function untitledName(chat: Conversation): string {
  const day = new Date(chat.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `Chat from ${day}`;
}

/** An earlier chat from before every chat had a project says so; a project the person cannot see is not named by its id. */
function projectLabel(chat: Conversation, names: ReadonlyMap<string, string>): string {
  if (chat.projectId === PANEL_PROJECT) return EARLIER;
  return names.get(chat.projectId) ?? "Another project";
}

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
      title: chat.title?.trim() || untitledName(chat),
      projectId: chat.projectId,
      projectName: projectLabel(chat, projectNames),
      status: chat.status,
      turns: chat.turnCount,
      waiting: chat.pendingAskCount,
      updatedAt: chat.updatedAt,
      href: chatHref(chat.conversationId, chat.projectId)
    }))
    .filter((row) => !needle || row.title.toLocaleLowerCase().includes(needle) || row.projectName.toLocaleLowerCase().includes(needle))
    .sort((left, right) => right.updatedAt - left.updatedAt);
}
