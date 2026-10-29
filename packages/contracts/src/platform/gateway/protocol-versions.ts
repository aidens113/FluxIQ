/**
 * The client gateway protocol versions this contract describes, oldest first.
 * 0.2 is additive over 0.1 and shares its major version, so either side
 * accepts the other (`clientGatewayProtocolVersionVerdict` compares majors):
 * a 0.1 client ignores `server.revoked`, `server.going_away`, `runContext`
 * and the new `session_ready` and `pairing_required` fields, and a 0.2 client
 * reads their absence from a 0.1 server as "not sent". Discovery publishes this
 * list as `protocols.clientGateway`.
 *
 * `CLIENT_GATEWAY_PROTOCOL_VERSION` (the version the gateway stamps on its
 * envelopes) stays `0.1` until the gateway sends the 0.2 messages; it is also
 * a trace contract version, so raising it is the gateway lane's change.
 */
export const CLIENT_GATEWAY_PROTOCOL_VERSIONS = Object.freeze(["0.1", "0.2"] as const);

export type ClientGatewayProtocolVersion = (typeof CLIENT_GATEWAY_PROTOCOL_VERSIONS)[number];

/** The newest version this contract describes. */
export const CLIENT_GATEWAY_LATEST_PROTOCOL_VERSION: ClientGatewayProtocolVersion = "0.2";
