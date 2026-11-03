// The thread itself: what a conversation is attached to, whether it is still
// open, and how much of it there is.
//
// A conversation belongs to something a person recognises -- a project, or,
// inside it, a Flow, a build or a run -- because that is what they will be
// looking at when they answer. The subject is a kind and an id and nothing
// more: Core does not resolve it here, and a subject whose Flow was deleted
// still reads back, because the thread is the record of what was said.

import type { AutomationStudioConversationTurn } from "./turn.ts";

export const AUTOMATION_STUDIO_CONVERSATION_SUBJECT_KINDS = ["project", "flow", "build", "run"] as const;
export type AutomationStudioConversationSubjectKind = (typeof AUTOMATION_STUDIO_CONVERSATION_SUBJECT_KINDS)[number];

export const AUTOMATION_STUDIO_CONVERSATION_STATUSES = ["open", "resolved"] as const;
export type AutomationStudioConversationStatus = (typeof AUTOMATION_STUDIO_CONVERSATION_STATUSES)[number];

/** What the thread is about. For `project` the id is the project's own id. */
export type AutomationStudioConversationSubject = {
  kind: AutomationStudioConversationSubjectKind;
  id: string;
};

/**
 * One thread. `revision` rises on every turn and every answer, and is what the
 * project change feed carries, so a reader that saw revision N knows it has
 * not seen what produced N+1.
 */
export type AutomationStudioConversation = {
  conversationId: string;
  projectId: string;
  subject: AutomationStudioConversationSubject;
  status: AutomationStudioConversationStatus;
  /** Core's own short name for the thread, or null when it was opened without one. */
  title: string | null;
  revision: number;
  turnCount: number;
  /** Asks still waiting for an answer. A parked run is waiting on one of these. */
  pendingAskCount: number;
  createdAt: number;
  updatedAt: number;
};

/** A thread and the turns a reader asked for: everything, or everything after `sinceTurnId`. */
export type AutomationStudioConversationThread = {
  conversation: AutomationStudioConversation;
  turns: AutomationStudioConversationTurn[];
  /** True when the limit cut the page short, so the reader should ask again from the last turn it got. */
  hasMore: boolean;
};

export function isAutomationStudioConversationSubjectKind(value: unknown): value is AutomationStudioConversationSubjectKind {
  return typeof value === "string" && (AUTOMATION_STUDIO_CONVERSATION_SUBJECT_KINDS as readonly string[]).includes(value);
}

export function isAutomationStudioConversationStatus(value: unknown): value is AutomationStudioConversationStatus {
  return typeof value === "string" && (AUTOMATION_STUDIO_CONVERSATION_STATUSES as readonly string[]).includes(value);
}
