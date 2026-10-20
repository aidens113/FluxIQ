// The credential-bearing fields of protocol messages (D7). A message of one of
// these types is recorded as structured JSON with each field replaced by a
// declared credential redaction, and its raw text is never stored.

export const CLIENT_GATEWAY_TRACE_CREDENTIAL_FIELDS: Readonly<Record<string, readonly (readonly string[])[]>> = Object.freeze({
  "client.hello": Object.freeze([Object.freeze(["payload", "token"])]),
  "client.pairing_submit": Object.freeze([Object.freeze(["payload", "pairingCode"])]),
  "server.session_ready": Object.freeze([Object.freeze(["payload", "token"])])
});
