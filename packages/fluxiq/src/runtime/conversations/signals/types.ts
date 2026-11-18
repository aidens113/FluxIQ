/**
 * Where a changed thread lives: one project's database, or one person's panel
 * database (`../assistant/store/`). Server-side only: a reader is told at most
 * the thread's id, and only after its own authority over this scope is
 * decided (the panel's change stream, `apps/web/src/app/api/panel/changes`).
 */
export type AutomationStudioConversationSignalScope =
  | { readonly kind: "project"; readonly projectId: string }
  | { readonly kind: "panel"; readonly userId: string };

/**
 * One signal that a thread changed: a turn written, an ask raised, answered or
 * expired, the thread opened, renamed or deleted. It names the thread and
 * where it lives, never what was said. `version` counts the signals this hub
 * has given since it started, so two can be told apart; it starts again at 1
 * with a new process.
 */
export type AutomationStudioConversationSignal = {
  readonly scope: AutomationStudioConversationSignalScope;
  readonly conversationId: string;
  readonly version: number;
};

/** Hears each signal as it is given. A throw is reported and never reaches the write that signalled. */
export type AutomationStudioConversationSignalListener = (signal: AutomationStudioConversationSignal) => void;

/** Where a reader subscribes to thread changes (`AutomationStudioConversations.signals`). */
export type AutomationStudioConversationSignalsPort = {
  /** Hears every later signal; returns the unsubscribe. */
  subscribe(listener: AutomationStudioConversationSignalListener): () => void;
  /** The version of the latest signal, 0 before the first. */
  version(): number;
};

/** What a writer signals through, once its write has committed. */
export type AutomationStudioConversationSignalSink = {
  signal(scope: AutomationStudioConversationSignalScope, conversationId: string): void;
};
