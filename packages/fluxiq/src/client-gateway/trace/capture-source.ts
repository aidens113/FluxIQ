import type { ClientGatewayTraceSink } from "./types.ts";

/**
 * Where the client gateway finds the trace to record into (traces and offline
 * trials, P2): the sink of the episode the dispatching async context runs in,
 * read synchronously the way the gateway reads `hostLease` and `channelScope`.
 * The program owns episodes and their stores; the gateway never imports them.
 * Unset on the gateway, or answering `undefined`, nothing is captured and
 * capture costs nothing.
 */
export type ClientGatewayTraceCaptureSource = {
  /** The open trace the dispatching async context records into, or nothing outside every traced episode. */
  current(): ClientGatewayTraceSink | undefined;
};
