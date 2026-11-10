// How the chat reaches FluxIQ. The client supplies this; the chat never knows
// whether a request crossed a browser extension's background, a Next.js panel's
// program API, or anything else. Records come back as Core wrote them, unchecked:
// the chat reads each with a checking reader (`conversation/core-thread.ts`), so
// a shape it does not know is a failed read, never a thrown error.

import type { ChatResult } from "./result.ts";
import type { ChatResultsPort } from "./results.ts";
import type { ChatSelection } from "./selection.ts";

/** Core's subject kinds a thread can be about. `panel`: the panel-wide thread, about no one project, Flow or run. */
export type ChatSubjectKind = "project" | "flow" | "run" | "panel";

/** Finds a subject's open thread. `subjectId` absent on the project's own thread: the project is the subject. */
export type ChatThreadListQuery = {
  subjectKind: ChatSubjectKind;
  subjectId?: string;
  projectId?: string;
  status: "open";
  limit: number;
};

/** Reads a page of a thread forward from `sinceTurnId`, or from its start. */
export type ChatThreadReadQuery = {
  projectId: string;
  conversationId: string;
  sinceTurnId: string | undefined;
  limit: number;
};

/**
 * What is on screen when a person sends: what makes Core read "run it" as about this.
 * `page` is the panel page the person is on, in the client's own words (e.g. "flows").
 * `selection` is what the person has picked there. A client that supplies neither
 * sends neither; the chat never invents them.
 */
export type ChatOnScreen = {
  flowId?: string;
  runId?: string;
  recordingId?: string;
  page?: string;
  selection?: ChatSelection;
};

/** A person's message: into `conversationId` when there is one, or into a thread opened with the subject and title. */
export type ChatSend = {
  text: string;
  conversationId: string | undefined;
  projectId: string | undefined;
  subjectKind?: ChatSubjectKind;
  subjectId?: string;
  title?: string;
  onScreen?: ChatOnScreen;
};

/** A reference a turn carries beside its words, as Core wrote it. Never a payload. */
export type ChatAttachment = { kind: string; ref: string };

/**
 * An answer to a question Core asked in a turn. `authorizationPin` is present
 * only when the person just re-authorized this answer (`ChatAskPort`): a
 * transport sends it and forgets it, and the chat never stores or logs it.
 * `turn` says which turn asked, for a client that must act on what that turn
 * carries once the answer is taken.
 */
export type ChatAnswer = {
  askId: string;
  kind: string;
  value: string | undefined;
  projectId: string | undefined;
  authorizationPin?: string;
  turn?: { conversationId: string; turnId: string; attachment?: ChatAttachment };
};

/** Every thread a person can see: across all their projects when `projectId` is absent. */
export type ChatThreadCatalogQuery = { projectId?: string; limit: number };

/** Core's conversation. Each `conversation`/`conversations` field holds Core's record as it answered it. */
export type ChatConversationPort = {
  listThreads(query: ChatThreadListQuery): Promise<ChatResult<{ conversations?: unknown }>>;
  readThread(query: ChatThreadReadQuery): Promise<ChatResult<{ conversation?: unknown }>>;
  /** `problem`: the message was stored, but something after that went wrong; the chat says it. */
  send(message: ChatSend): Promise<ChatResult<{ conversation?: unknown; problem?: string }>>;
  /** `problem` in the value: the answer was taken, but something after that went wrong; the chat says it. */
  answer(answer: ChatAnswer): Promise<ChatResult<unknown>>;
  /** Every thread, for the thread list (`ChatThreadsOptions`). Absent: the chat shows one thread at a time. */
  listAllThreads?(query: ChatThreadCatalogQuery): Promise<ChatResult<{ conversations?: unknown }>>;
};

/**
 * Hears that something the chat shows may have changed, as soon as the client
 * knows of it. Absent: the chat reads on its 4 s poll alone. Present: it reads at
 * once on each change and its poll drops to a slow beat, which stays because a
 * change made elsewhere reaches a client with no push channel in no other way.
 */
export type ChatChangesPort = {
  subscribe(listener: (change: { conversationId?: string }) => void): () => void;
};

/** How a page overlay shows, for a client that has one; a client with none answers `hidden`. */
export type ChatOverlayPreference = "expanded" | "collapsed" | "hidden";

/** FluxIQ's live activity. `state` is a `ChatActivityState` the feed checks before it believes it. */
export type ChatActivityPort = {
  read(): Promise<ChatResult<{ state?: unknown }>>;
  /** Hears each new state the client is told of; answers an unsubscribe. */
  subscribe(listener: (state: unknown) => void): () => void;
  /** Absent on a client with no page overlay. */
  setOverlay?(overlay: ChatOverlayPreference): Promise<ChatResult<{ state?: unknown }>>;
};

/** The work a press is about: a build by its Flow, a run by its id. */
export type ChatStopTarget = { projectId: string; flowId?: string; runId?: string };

/** A run a press is about. */
export type ChatRunTarget = { projectId: string; runId: string };

/** Stop, Take over and Hand back. A refusal by Core is a failed result, whatever carried it. */
export type ChatRunPort = {
  stop(target: ChatStopTarget): Promise<ChatResult<{ cancellationRequested?: boolean }>>;
  takeOver(target: ChatRunTarget): Promise<ChatResult<unknown>>;
  handBack(target: ChatRunTarget): Promise<ChatResult<unknown>>;
  /** Shows a run's task instructions in FluxIQ; absent where the client cannot. */
  openInstructions?(runId: string): Promise<ChatResult<unknown>>;
};

/** One recording as Core lists it. */
export type ChatRecordingSummary = {
  id: string;
  description?: string | undefined;
  status?: string | undefined;
  projectId?: string | undefined;
  startedAt?: number | undefined;
  endedAt?: number | undefined;
};

/** The recordings a person may attach. Absent: the composer offers no attachment. */
export type ChatRecordingsPort = {
  list(query: { page: number; pageSize: number }): Promise<ChatResult<{ items?: readonly ChatRecordingSummary[] }>>;
};

/** Whether FluxIQ has a model key: never a key's value. Absent: the chat never claims a key is missing. */
export type ChatModelsPort = {
  readKeys(): Promise<ChatResult<{ keys?: unknown }>>;
};

/** Everything the chat asks of the client's connection to FluxIQ. */
export type ChatTransport = {
  readonly conversation: ChatConversationPort;
  readonly activity: ChatActivityPort;
  readonly runs: ChatRunPort;
  readonly recordings?: ChatRecordingsPort;
  readonly models?: ChatModelsPort;
  readonly changes?: ChatChangesPort;
  /** A task's answer (`./results.ts`). Absent: the chat shows no answer turn. */
  readonly results?: ChatResultsPort;
};
