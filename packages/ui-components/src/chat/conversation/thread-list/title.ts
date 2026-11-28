import { conversationSubjectLabel } from "./labels.ts";
import type { ChatThreadSummary } from "./summary.ts";

/**
 * The name at the top of the chat: the conversation's own. Core's title first; a thread Core did not title reads
 * as the noun for what it is about ("New chat", "This run", "This Flow"); with no thread yet, `emptyTitle` (a host
 * whose chat has its own name), else "New chat". Never the project's name: the project has its own switcher, and
 * the name here is not a control.
 */
export function conversationDisplayTitle(thread: ChatThreadSummary | null, emptyTitle?: string): string {
  if (!thread) return emptyTitle?.trim() || "New chat";
  return conversationSubjectLabel(thread);
}
