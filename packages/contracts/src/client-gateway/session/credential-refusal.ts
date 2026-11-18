/**
 * Why the credential a hello carried was not accepted, on the
 * `server.pairing_required` the gateway answers it with instead (gateway 0.2):
 *
 * - `expired`: it was this client's, and its life ran out unused;
 * - `refused`: the gateway does not accept it: unknown, another client's,
 *   approved for another domain, or of a trust that ended without the client
 *   being told (`ClientGatewayTrustedClient.revokedFor` absent).
 *
 * Absent when the hello carried no credential. A credential whose trust was
 * revoked is never answered with pairing: `server.revoked` says so.
 */
export type ClientGatewayPairingCredentialRefusal = "expired" | "refused";
