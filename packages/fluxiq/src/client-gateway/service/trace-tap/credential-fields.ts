// The credential-bearing fields of protocol messages (D7). A message of one of
// these types is recorded as structured JSON with each field replaced by a
// declared credential redaction, and its raw text is never stored. A managed
// host's enrolment ticket is a credential too.

export const CLIENT_GATEWAY_TRACE_CREDENTIAL_FIELDS: Readonly<Record<string, readonly (readonly string[])[]>> = Object.freeze({
  "client.hello": Object.freeze([Object.freeze(["payload", "token"]), Object.freeze(["payload", "enrolmentTicket"])]),
  "client.pairing_submit": Object.freeze([Object.freeze(["payload", "pairingCode"])]),
  "server.session_ready": Object.freeze([Object.freeze(["payload", "token"])])
});
