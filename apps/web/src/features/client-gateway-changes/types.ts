import type { PanelChangeStatus, PanelChangesPort } from "../panel-changes";

/** Whether the panel is hearing gateway changes: the page's change stream's own status (`PanelChangeStatus`). */
export type GatewayChangeStatus = PanelChangeStatus;

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

/** One snapshot read as it came back: whether the response was a success, its status, and its parsed body. */
export type GatewaySnapshotRead = { ok: boolean; status: number; body: unknown };

/** Where the subscription reaches the browser: the page's change stream, and the snapshot read. */
export type GatewayChangeSources = {
  /** The page's one change stream (`features/panel-changes`), whose `gateway` events and openings say when to read. */
  changes: PanelChangesPort;
  /** Reads the snapshot once; rejects only when the request could not be made. */
  readSnapshot(): Promise<GatewaySnapshotRead>;
};
