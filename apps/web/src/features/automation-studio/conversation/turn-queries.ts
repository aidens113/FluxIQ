// Reads over the conversation endpoints, in the shape Core's handlers
// actually take and return.
//
// `list-conversations` and `get-conversation` both match the request
// coordinator's read shape (a `list-` or `get-` prefix), so they are
// deduplicated, retried twice and bounded at fifteen seconds without any
// policy of their own.
//
// **Every project-scoped endpoint needs `projectId` in its own payload.** The
// transport does not add one, and Core's handlers read it straight off the
// request: without it the panel gets `Unknown Automation Studio project: ` and
// nothing else, which is what a live run against the real endpoints returned
// before this module carried it. The thread list is the one read that may go
// out without a project, because `projectId: null` means "every project this
// person can see" -- which is how a surface that is not inside a project finds
// a question at all. Every other call takes the project from the conversation
// it is about.

import type { ProgramCommandTransport } from "../data/program-transport";
import { parseConversation, parseConversationTurns, type Conversation, type ConversationStatus, type ConversationTurn } from "./thread";

export const CONVERSATION_LIST_PAGE_SIZE = 25;
export const CONVERSATION_TURN_PAGE_SIZE = 100;

export type ConversationListQuery = {
  /** `null` asks across every project the person can see. */
  projectId: string | null;
  status?: ConversationStatus;
  limit?: number;
};

export type ConversationDetailQuery = {
  projectId: string;
  conversationId: string;
  /** Only turns after this one; absent reads the thread from its start. */
  sinceTurnId?: string | null;
  limit?: number;
};

/** What a detail read gives back once the envelope Core sends is opened. */
export type ConversationThreadPage = {
  conversation: Conversation | null;
  turns: ConversationTurn[];
  hasMore: boolean;
};

export type ConversationReadResult = {
  ok: boolean;
  aborted?: boolean;
  error?: string;
  page?: ConversationThreadPage;
};

export function listConversations(api: ProgramCommandTransport, payload: ConversationListQuery, signal?: AbortSignal) {
  return api.post<{ conversations?: unknown }>(
    "list-conversations",
    { ...payload },
    signal ? { signal } : {}
  );
}

/**
 * Core answers `{ conversation: { conversation, turns, hasMore } }` -- the
 * thread record wraps both the conversation and its page of turns. Reading
 * `payload.conversation` as the conversation and `payload.turns` as the turns
 * is how the window showed an empty transcript for a thread that had three
 * turns in it, so the envelope is opened exactly once, here.
 */
export async function getConversation(
  api: ProgramCommandTransport,
  payload: ConversationDetailQuery,
  signal?: AbortSignal
): Promise<ConversationReadResult> {
  const result = await api.post<{ conversation?: unknown }>(
    "get-conversation",
    { ...payload },
    signal ? { signal } : {}
  );
  if (!result.ok) {
    return {
      ok: false,
      ...(result.aborted ? { aborted: true } : {}),
      ...(result.error ? { error: result.error } : {})
    };
  }
  return { ok: true, page: conversationThreadPage(result.payload?.conversation) };
}

export function conversationThreadPage(value: unknown): ConversationThreadPage {
  const envelope = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  // A thread whose turns sit beside it, and a bare conversation record, both
  // read; the second is what a hand-built double in a test hands over.
  const record = "conversation" in envelope ? envelope.conversation : envelope;
  return {
    conversation: parseConversation(record),
    turns: parseConversationTurns(envelope.turns),
    hasMore: envelope.hasMore === true
  };
}

export type ConversationAttachmentQuery = {
  projectId: string;
  conversationId: string;
  turnId: string;
};

/**
 * What a turn's attachment refers to. A turn carries `attachment: { kind, ref }`
 * -- a reference, not a payload -- so something has to resolve the reference
 * before the panel can draw the thing. Every caller treats this as optional: a
 * deployment with no resolver answers with a refusal, and the turn then renders
 * its attachment as a labelled reference the person can open elsewhere.
 */
export function getConversationAttachment(api: ProgramCommandTransport, payload: ConversationAttachmentQuery, signal?: AbortSignal) {
  return api.post<{ attachment?: unknown }>(
    "get-conversation-attachment",
    { ...payload },
    signal ? { signal } : {}
  );
}
