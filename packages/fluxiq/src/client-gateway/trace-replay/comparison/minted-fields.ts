// The fields of a recorded event that hold an id or a time Core minted itself
// rather than derived from what it received (traces and offline trials, P3).
// A replay feeds the recorded ids and times back (`ClientGatewayServiceOptions.
// createId`, `now`), so these match whenever the feed reached them; a
// divergence on these fields alone is `nondeterminism`, never normalized away.
// Each is named by its path in the compared event.

export const CLIENT_GATEWAY_TRACE_MINTED_FIELDS: ReadonlySet<string> = new Set([
  /** A server message's id. */
  "payload.value.id",
  /** A server message's time stamp. */
  "payload.value.timestamp",
  /** A ping's nonce. */
  "payload.value.payload.nonce",
  /** A session id a session view or session-ready message names. */
  "payload.value.sessionId",
  "payload.value.payload.sessionId",
  /** The trusted-client id a pairing approval mints (`trusted-clients.ts`, outside the id source). */
  "payload.value.trustedClientId"
]);
