/**
 * One thing worth reading again, as the stream holds it before sending. It
 * names at most what the caller may already read: the gateway snapshot, one
 * thread by id, or one project's live activity by id. Never what changed.
 */
export type PanelChange =
  | { readonly topic: "gateway" }
  | { readonly topic: "conversation"; readonly conversationId: string }
  | { readonly topic: "activity"; readonly projectId: string };

/** Where a topic hands its changes to the stream. */
export type PanelChangeSink = {
  /** A change this caller may hear of; the stream coalesces repeats until it is sent. */
  changed(change: PanelChange): void;
  /** The topic cannot go on (its caller's authority could not be decided, or was lost): the stream fails and the browser reconnects. */
  fail(error: unknown): void;
};

/** One source of changes. `start` subscribes and answers its stop; the stream calls each once. */
export type PanelChangeTopic = {
  start(sink: PanelChangeSink): () => void;
};
