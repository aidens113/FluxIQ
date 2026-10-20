// The chat turn that started an episode, for its manifest's context (D9): the
// thread the work runs for (`../conversations/context/`, entered by the chat's
// command executor) and the last turn the person wrote in it, which is the
// message the build or run was started from. Read from the stored thread a
// page at a time to its end. Work not started from a chat has no thread, and
// a thread that cannot be read is said so rather than failing the work.

import { currentAutomationStudioConversation } from "../../conversations/context/index.ts";
import type { AutomationStudioGatewayTraceConversationContext, AutomationStudioGatewayTraceConversationReader } from "./types.ts";

const PAGE_TURNS = 200;

/** The thread and the person's turn that started the calling work in `projectId`, or null outside every thread. */
export async function automationStudioGatewayTraceConversationContext(reader: AutomationStudioGatewayTraceConversationReader | undefined, projectId: string): Promise<AutomationStudioGatewayTraceConversationContext | null> {
  const ambient = currentAutomationStudioConversation(projectId);
  if (ambient === null) return null;
  if (reader === undefined || !reader.available) return { conversationId: ambient.conversationId, turn: null, unavailable: "no_conversation_store" };
  try {
    let last: AutomationStudioGatewayTraceConversationContext["turn"] = null;
    let sinceTurnId: string | undefined;
    for (;;) {
      const page = await reader.getConversation({ projectId, conversationId: ambient.conversationId, limit: PAGE_TURNS, ...(sinceTurnId === undefined ? {} : { sinceTurnId }) });
      if (page === null || page.turns.length === 0) break;
      for (const turn of page.turns) {
        if (turn.author === "person") last = { turnId: turn.turnId, ordinal: turn.ordinal, createdAt: turn.createdAt, text: turn.text };
      }
      if (!page.hasMore) break;
      sinceTurnId = page.turns.at(-1)?.turnId;
    }
    return { conversationId: ambient.conversationId, turn: last, unavailable: null };
  } catch (error) {
    // The trace says the turn could not be read; the work it describes goes on.
    return { conversationId: ambient.conversationId, turn: null, unavailable: error instanceof Error ? error.name : "unreadable" };
  }
}
