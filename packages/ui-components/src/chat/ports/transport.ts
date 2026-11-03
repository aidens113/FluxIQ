// How the chat reaches FluxIQ. The client supplies this; the chat never knows
// whether a request crossed a browser extension's background, a Next.js panel's
// program API, or anything else. Records come back as Core wrote them, unchecked:
// the chat reads each with a checking reader (`conversation/core-thread.ts`), so
// a shape it does not know is a failed read, never a thrown error.

import type { ChatResult } from "./result.ts";

/** Core's subject kinds a thread can be about. */
export type ChatSubjectKind = "project" | "flow" | "run";

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

/** What is on screen when a person sends: what makes Core read "run it" as about this. */
export type ChatOnScreen = { flowId?: string; runId?: string; recordingId?: string };

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

/** An answer to a question Core asked in a turn. */
export type ChatAnswer = { askId: string; kind: string; value: string | undefined; projectId: string | undefined };

/** Core's conversation. Each `conversation`/`conversations` field holds Core's record as it answered it. */
export type ChatConversationPort = {
  listThreads(query: ChatThreadListQuery): Promise<ChatResult<{ conversations?: unknown }>>;
  readThread(query: ChatThreadReadQuery): Promise<ChatResult<{ conversation?: unknown }>>;
  send(message: ChatSend): Promise<ChatResult<{ conversation?: unknown }>>;
  answer(answer: ChatAnswer): Promise<ChatResult<unknown>>;
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
};
