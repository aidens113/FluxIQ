/**
 * Why the gateway is closing every socket on `server.going_away` (gateway
 * 0.2): `shutdown` (the server is stopping and may not return soon) or
 * `restart` (a deploy or restart; reconnect after `retryAfterMs`). Either way
 * the client keeps its credential and reconnects; a client that meets a
 * reason it does not know treats it as `restart`.
 */
export const CLIENT_GATEWAY_GOING_AWAY_REASONS = Object.freeze(["shutdown", "restart"] as const);

export type ClientGatewayGoingAwayReason = (typeof CLIENT_GATEWAY_GOING_AWAY_REASONS)[number];
