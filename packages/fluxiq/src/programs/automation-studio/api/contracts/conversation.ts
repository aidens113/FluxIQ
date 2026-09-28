// Requests for the conversation endpoints: a project's threads, the thread a
// person starts, one thread and what has been said in it, a turn the person
// writes, and the answer to an ask.
//
// Core writes automation turns internally, through the conversations
// collaborator's writer; these are what a person uses. That asymmetry is about
// *authorship* and nothing else -- nothing outside Core should be able to post
// a turn as the automation, because a turn attributed to FluxIQ is FluxIQ
// speaking. Opening a thread is not authorship, and until 2026-09-28 the
// asymmetry reached further than it was meant to: with no `open-conversation`
// endpoint a person could not start a conversation at all, and `append-turn`
// refuses an unknown thread (`runtime/conversations/store.ts`,
// `requireConversation`), so there was no other way in. The chat window could
// only ever be spoken *to* by a run, a build or a node.
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

/**
 * The thread a person starts.
 *
 * `subjectKind` and `subjectId` say what the thread is about, and are checked
 * by `requestedSubject`, which takes only `project`, `flow`, `build` or `run`.
 * Both are optional together: a person opening the chat with nothing selected
 * is talking about the project, so the subject falls back to the project's own
 * id rather than being refused. `openConversation` continues the subject's open
 * thread when there is one, so asking twice does not leave two.
 *
 * Opening a thread is `authoring`, like writing a turn: it creates nothing a
 * person would need warning about and must not take a PIN.
 */
export type ConversationOpenRequest = FlowProjectRequest & {
  subjectKind?: string;
  subjectId?: string;
  title?: string;
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
