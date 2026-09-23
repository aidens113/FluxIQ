// Reads over the conversation endpoints the contract fixes.
//
// `list-conversations` and `get-conversation` both match the request
// coordinator's read shape (a `list-` or `get-` prefix), so they are
// deduplicated, retried twice and bounded at fifteen seconds without any
// policy of their own.

import type { ProgramCommandTransport } from "../data/program-transport";
import type { ConversationStatus } from "./thread";

export const CONVERSATION_LIST_PAGE_SIZE = 25;
export const CONVERSATION_TURN_PAGE_SIZE = 100;

export type ConversationListQuery = {
  /** `null` asks across every project the person can see, which is what the global prompt needs. */
  projectId: string | null;
  status?: ConversationStatus;
  limit?: number;
  offset?: number;
};

export type ConversationDetailQuery = {
  conversationId: string;
  /** Only turns after this one; absent reads the thread from its start. */
  sinceTurnId?: string | null;
  limit?: number;
};

export function listConversations(api: ProgramCommandTransport, payload: ConversationListQuery, signal?: AbortSignal) {
  return api.post<{ conversations?: unknown; page?: { total?: number; limit?: number; offset?: number } }>(
    "list-conversations",
    { ...payload },
    signal ? { signal } : {}
  );
}

export function getConversation(api: ProgramCommandTransport, payload: ConversationDetailQuery, signal?: AbortSignal) {
  return api.post<{ conversation?: unknown; turns?: unknown; page?: { hasMore?: boolean } }>(
    "get-conversation",
    { ...payload },
    signal ? { signal } : {}
  );
}

export type ConversationAttachmentQuery = {
  conversationId: string;
  turnId: string;
  ref: string;
};

/**
 * The one read the fixed contract does not name. A turn carries
 * `attachment: { kind, ref }` -- a reference, not a payload -- so something has
 * to resolve the reference before the panel can draw the thing. Every caller
 * treats this command as optional: without it a turn renders its attachment as
 * a labelled reference the person can open elsewhere, which is the whole
 * contract and nothing more. With it, the attachment is drawn in the turn.
 */
export function getConversationAttachment(api: ProgramCommandTransport, payload: ConversationAttachmentQuery, signal?: AbortSignal) {
  return api.post<{ attachment?: unknown }>(
    "get-conversation-attachment",
    { ...payload },
    signal ? { signal } : {}
  );
}
