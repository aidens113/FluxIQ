/**
 * What changed in the gateway's pairings or clients. A change names only its
 * kind: never a pairing code, a credential, or which client or session it was
 * about, so it can be handed to any reader allowed to read the snapshot, which
 * is where what changed is read, under that reader's own authority.
 */
export const CLIENT_GATEWAY_CHANGE_KINDS = [
  // A client asked to pair and a challenge is waiting for approval.
  "pairing.requested",
  // A waiting challenge lapsed unapproved.
  "pairing.expired",
  // A waiting challenge was taken back because the session that asked went away.
  "pairing.withdrawn",
  // A person approved a waiting challenge; its client is paired and ready.
  "pairing.approved",
  // A person dismissed a waiting challenge.
  "pairing.denied",
  // An approval was refused because the client was no longer waiting; any trust it began was taken back.
  "pairing.refused",
  // A client was trusted without a pairing challenge: a managed host enrolled, or consent given before its connection.
  "client.paired",
  // A client's trust was ended.
  "client.revoked",
  // A trusted client's session became ready.
  "client.connected",
  // A session ended.
  "client.disconnected"
] as const;

export type ClientGatewayChangeKind = (typeof CLIENT_GATEWAY_CHANGE_KINDS)[number];
