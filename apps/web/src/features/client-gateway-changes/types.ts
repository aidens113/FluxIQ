/**
 * Whether the panel is hearing gateway changes: `connecting` before the
 * stream first opens, `live` while it is open, `reconnecting` while the
 * browser re-opens a stream that dropped (it does so by itself), and `closed`
 * when it will not: the server refused or failed it, or this browser has no
 * EventSource. A closed stream opens again when the tab is shown again, the
 * network comes back, or a reader asks to refresh.
 */
export type GatewayChangeStatus = "connecting" | "live" | "reconnecting" | "closed";

/** What every reader of the shared subscription sees. A new object each time anything in it changes. */
export type GatewayChangeState = {
  readonly status: GatewayChangeStatus;
  /** The latest `GET /api/client-gateway/snapshot` payload read, kept through a failed read; undefined before the first or after a refusal. */
  readonly snapshot: Readonly<Record<string, unknown>> | undefined;
  /** The latest snapshot read failed. */
  readonly readFailed: boolean;
  /** The latest snapshot read was refused (401 or 403): the person signed out or may not read it. */
  readonly refused: boolean;
  /** Counts the stream opening and each change it signalled: each is a reason for a reader with reads of its own to read again. */
  readonly revision: number;
};

/** The part of an `EventSource` the subscription uses, so a test can stand in for it. */
export type GatewayChangeStream = {
  readonly readyState: number;
  onopen: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  addEventListener(type: "change", listener: () => void): void;
  close(): void;
};

/** One snapshot read as it came back: whether the response was a success, its status, and its parsed body. */
export type GatewaySnapshotRead = { ok: boolean; status: number; body: unknown };

/** Where the subscription reaches the browser: the stream, the snapshot read, and the moments worth re-opening a closed stream. */
export type GatewayChangeSources = {
  /** Opens the change stream; undefined where the browser has no EventSource. */
  openStream(url: string): GatewayChangeStream | undefined;
  /** Reads the snapshot once; rejects only when the request could not be made. */
  readSnapshot(): Promise<GatewaySnapshotRead>;
  /** Calls back when the tab is shown again or the network comes back; returns the unsubscribe. */
  onWake(listener: () => void): () => void;
};
