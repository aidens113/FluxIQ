/**
 * One thing worth reading again, as the stream holds it before sending. It
 * names at most what the caller may already read: the gateway snapshot, one
 * thread by id, one project's live activity by id, or the caller's model
 * access (the Secret Keys snapshot), or the person's current project (the client snapshot again). Never what changed.
 */
export type PanelChange =
  | { readonly topic: "gateway" }
  | { readonly topic: "conversation"; readonly conversationId: string }
  | { readonly topic: "activity"; readonly projectId: string }
  | { readonly topic: "model-access" }
  | { readonly topic: "context" };

/** Where a topic hands its changes to the stream. */
export type PanelChangeSink = {
  /** A change this caller may hear of; the stream coalesces repeats until it is sent. */
  changed(change: PanelChange): void;
  /** The topic cannot go on (its caller's authority could not be decided, or was lost): the stream fails and the browser reconnects. */
  fail(error: unknown): void;
  /**
   * The stream's opening waits for `baseline`: the topic is reading the view
   * it compares later changes with. A browser reads everything once the stream
   * opens, so it then reads at or after that view and no change falls between
   * the two. Called while starting, before the first chunk is asked for; a
   * topic with nothing to compare against never calls it.
   */
  opensAfter(baseline: Promise<void>): void;
};

/** One source of changes. `start` subscribes and answers its stop; the stream calls each once. */
export type PanelChangeTopic = {
  start(sink: PanelChangeSink): () => void;
};
