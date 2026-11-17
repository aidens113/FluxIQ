import type { ClientGatewayChangeKind } from "./kinds.ts";

/**
 * One signal that the gateway's pairings or clients changed. `version` counts
 * the changes this gateway has signalled since it started, so a reader can
 * tell two signals apart; it starts again at 1 with a new gateway. `kind` is
 * the first change of the turn it stands for (one operation, such as an
 * approval that also readies its session, is one signal).
 */
export type ClientGatewayChange = { readonly kind: ClientGatewayChangeKind; readonly version: number };

/** Hears each change once it is signalled. A throw is audited and never reaches the gateway. */
export type ClientGatewayChangeListener = (change: ClientGatewayChange) => void;

/** Where a reader subscribes to pairing and client changes (`ClientGatewayService.changes`). */
export type ClientGatewayChangesPort = {
  /** Hears every later change; returns the unsubscribe. */
  subscribe(listener: ClientGatewayChangeListener): () => void;
  /** The version of the latest change signalled, 0 before the first. */
  version(): number;
};
