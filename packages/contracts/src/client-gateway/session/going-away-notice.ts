import type { ClientGatewayGoingAwayReason } from "../../platform/index.ts";

/**
 * `server.going_away` (gateway 0.2): the server is draining. No new work is
 * sent; the client keeps its credential and reconnects after `retryAfterMs`.
 */
export type ClientGatewayGoingAwayNotice = { reason: ClientGatewayGoingAwayReason; retryAfterMs: number };
