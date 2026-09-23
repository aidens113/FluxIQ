// Requests for the four conversation endpoints: a project's threads, one
// thread and what has been said in it, a turn the person writes, and the
// answer to an ask.
//
// Core writes automation turns internally, through the conversations
// collaborator's writer; these four are what a person uses. That asymmetry is
// deliberate -- nothing outside Core should be able to post a turn as the
// automation, because a turn attributed to FluxIQ is FluxIQ speaking.
//
// `askId` alone identifies an ask, but every Automation Studio endpoint is
// project-scoped, so `answer-ask` carries the project too: it is which
// database to open, not a second key.

import type { FlowProjectRequest } from "./flow.ts";

/**
 * A project's threads, most recently touched first, optionally narrowed to one
 * subject or to the open ones.
 *
 * `projectId` may be null, meaning "every project this caller can see". That
 * exists for the globally mounted prompt: nothing can push to the browser, so
 * reachability is a poll, and a poll cannot name the project an unanswered ask
 * belongs to before it has found it. The projects searched are exactly the
 * ones `projects` itself would return for this request's domain scope.
 */
export type ConversationListRequest = Omit<FlowProjectRequest, "projectId"> & {
  projectId: string | null;
  subjectKind?: string;
  subjectId?: string;
  status?: string;
  limit?: unknown;
};

/** One thread. With `sinceTurnId` only the turns after that one are read, which is what a reader already holding it asks for. */
export type ConversationReadRequest = FlowProjectRequest & {
  conversationId: string;
  sinceTurnId?: string;
  limit?: unknown;
};

/** A turn the person writes. The author is always the person: Core's own turns do not come through the API. */
export type ConversationTurnAppendRequest = FlowProjectRequest & {
  conversationId: string;
  text: string;
  attachmentKind?: string;
  attachmentRef?: string;
};

/**
 * The answer to one ask. `kind` must settle the ask's kind -- grant or deny a
 * permission or a confirmation, name an option for a choice, words for an open
 * question -- and `value` carries the option id or the words.
 */
export type ConversationAnswerRequest = FlowProjectRequest & {
  askId: string;
  kind: string;
  value?: string;
};

/**
 * What a turn's attachment refers to. Optional in every sense: a thread with
 * no attachments never calls it, and a deployment that cannot serve the kind
 * says so rather than answering with nothing.
 */
export type ConversationAttachmentRequest = FlowProjectRequest & {
  conversationId: string;
  turnId: string;
};
