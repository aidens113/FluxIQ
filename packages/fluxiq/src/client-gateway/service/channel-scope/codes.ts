/**
 * Failure codes for a command refused because its target session is on the
 * other side of a channel scope; category `blocked_by_capability_or_policy`,
 * effect `unacted`, never sent.
 *
 * - `outsideScope`: issued inside a scope to a session that scope does not hold
 *   (a live session, or another scope's).
 * - `scopedSession`: issued outside any scope to a session that belongs to one.
 */
export const CLIENT_GATEWAY_CHANNEL_SCOPE_REFUSAL_CODES = Object.freeze({
  outsideScope: "channel_scope.outside_scope",
  scopedSession: "channel_scope.scoped_session"
} as const);

/** One of the failure codes for a command refused across a channel scope. */
export type ClientGatewayChannelScopeRefusalCode = (typeof CLIENT_GATEWAY_CHANNEL_SCOPE_REFUSAL_CODES)[keyof typeof CLIENT_GATEWAY_CHANNEL_SCOPE_REFUSAL_CODES];
