// One turn: who said it, what they said, what it asks, and what it shows.
//
// A turn is append-only. Nothing edits one, nothing deletes one, and its
// `ordinal` is its place in the thread for good -- which is what lets a reader
// say "everything after turn X" and get an answer that cannot shift under it.
//
// `attachment` names something the reader renders itself: a Flow graph diff, a
// dataset preview, a capture. The thread carries the name and the reference
// and renders nothing, so a new kind of thing to show needs no change here.

import type { AutomationStudioConversationAsk } from "./ask.ts";

export const AUTOMATION_STUDIO_CONVERSATION_AUTHORS = ["automation", "person"] as const;
export type AutomationStudioConversationAuthor = (typeof AUTOMATION_STUDIO_CONVERSATION_AUTHORS)[number];

/** The longest a turn's text may be. Past it the write is refused, never cut. */
export const AUTOMATION_STUDIO_CONVERSATION_TEXT_MAX = 16_000;

/** What a turn shows beside its words. `kind` names the renderer; `ref` is what it renders. */
export type AutomationStudioConversationAttachment = {
  kind: string;
  ref: string;
};

export type AutomationStudioConversationTurn = {
  turnId: string;
  conversationId: string;
  /** Its place in the thread, from 1. Stable once written. */
  ordinal: number;
  author: AutomationStudioConversationAuthor;
  createdAt: number;
  text: string;
  /** Who wrote it, when a person did through the API. Null for an automation turn. */
  actorId: string | null;
  /** The question this turn asks, or null when it only says something. */
  ask: AutomationStudioConversationAsk | null;
  attachment: AutomationStudioConversationAttachment | null;
};

export function isAutomationStudioConversationAuthor(value: unknown): value is AutomationStudioConversationAuthor {
  return typeof value === "string" && (AUTOMATION_STUDIO_CONVERSATION_AUTHORS as readonly string[]).includes(value);
}
