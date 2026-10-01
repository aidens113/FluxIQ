// Every turn of a thread, for a model that reads it.
//
// The user's order of 2026-09-30: "Remove ANY AND ALL LIMITS ON THE NUMBER OF
// ELEMENTS PASSED TO MODEL. DO NOT HIDE INFORMATION." A model that reads the
// thread was shown its last 20 turns (the chat's instruction reader) or its first
// 40 (a recovery), each turn cut at 1,500 characters. A store reads a thread a
// page at a time, so the whole of it is read page after page until the store
// says there is no more.

import type { AutomationStudioConversationTurn } from "./turn.ts";

/** One page of a thread, as `AutomationStudioConversationStore.getConversation` and the service's own reader return it. */
export type AutomationStudioConversationThreadPage = { turns: readonly AutomationStudioConversationTurn[]; hasMore?: boolean | undefined } | null;

/** The page size asked for. The store holds a page to its own maximum, and paging goes on while it says there is more. */
const PAGE_TURNS = 200;

/**
 * Every turn of the thread, oldest first, or an empty list for a thread that
 * does not exist. `read` is the store's or the service's page reader.
 */
export async function automationStudioConversationWholeThread(
  read: (input: { conversationId: string; limit: number; sinceTurnId?: string }) => Promise<AutomationStudioConversationThreadPage>,
  conversationId: string
): Promise<AutomationStudioConversationTurn[]> {
  const turns: AutomationStudioConversationTurn[] = [];
  let sinceTurnId: string | undefined;
  for (;;) {
    const page = await read({ conversationId, limit: PAGE_TURNS, ...(sinceTurnId === undefined ? {} : { sinceTurnId }) });
    if (!page || page.turns.length === 0) return turns;
    turns.push(...page.turns);
    if (page.hasMore !== true) return turns;
    sinceTurnId = page.turns.at(-1)!.turnId;
  }
}
