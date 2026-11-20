/**
 * Whether the page is hearing changes: `connecting` before the stream first
 * opens, `live` while it is open, `reconnecting` while the browser re-opens a
 * stream that dropped (it does so by itself), and `closed` when it will not:
 * the server refused or failed it, or this browser has no EventSource. A
 * closed stream opens again when the tab is shown again, the network comes
 * back, or a reader asks (`reopen`).
 */
export type PanelChangeStatus = "connecting" | "live" | "reconnecting" | "closed";

/**
 * What a reader hears. Each part is optional; a reader takes the ones it reads.
 *
 * `opened` is the reason to read everything once: the stream opened, opened
 * again after a drop, or skipped a number, so a change may have been missed.
 * A reader that subscribes while the stream is already open is told `opened`
 * at once, since it has read nothing yet.
 */
export type PanelChangeListener = {
  status?(status: PanelChangeStatus): void;
  opened?(): void;
  /** Read the gateway snapshot again. */
  gateway?(): void;
  /** Read thread `conversationId` again. */
  conversation?(conversationId: string): void;
  /** Read project `projectId`'s live activity again. */
  activity?(projectId: string): void;
  /** Read the caller's model access (the Secret Keys snapshot) again. */
  modelAccess?(): void;
};

/** The page's one change stream, shared by every reader on it. */
export type PanelChangesPort = {
  /** Adds a reader; the first one opens the stream. Returns its unsubscribe; the last one closes the stream. */
  subscribe(listener: PanelChangeListener): () => void;
  status(): PanelChangeStatus;
  /** Opens the stream again if the browser gave up on it; a stream it is still re-opening is left to it. */
  reopen(): void;
};

/** The events `GET /api/panel/changes` sends. */
export type PanelChangeEventType = "gateway" | "conversation" | "activity" | "model-access";

/** The part of an `EventSource` the connection uses, so a test can stand in for it. */
export type PanelChangeEventStream = {
  readonly readyState: number;
  onopen: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  addEventListener(type: PanelChangeEventType, listener: (event: { readonly data?: unknown }) => void): void;
  close(): void;
};

/** Where the connection reaches the browser: the stream, and the moments worth re-opening a closed one. */
export type PanelChangeSources = {
  /** Opens the change stream; undefined where the browser has no EventSource. */
  openStream(url: string): PanelChangeEventStream | undefined;
  /** Calls back when the tab is shown again or the network comes back; returns the unsubscribe. */
  onWake(listener: () => void): () => void;
};
