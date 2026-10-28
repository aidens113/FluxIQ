/**
 * Why a connected client's credential was revoked: the reason on its record
 * and on `server.revoked` (gateway 0.2).
 *
 * - `revoked_by_user`: from the account's client list, one or all;
 * - `revoked_by_admin`: a workspace administrator revoked a member's client;
 * - `password_changed`: the person chose to revoke clients on a password change;
 * - `account_disabled`, `account_deleted`, `credentials_rotated`: provisioning
 *   (`disableAccount`, `deleteAccount`, `rotateCredentials`);
 * - `revoked_by_operator`: the operator's kill switch
 *   (`revoke-all-browser-credentials`);
 * - `credential_reused`: a credential older than the previous one was
 *   presented, so the client is presumed stolen.
 *
 * A client that meets a reason it does not know treats it as revoked all the same.
 */
export const CLIENT_GATEWAY_REVOCATION_REASONS = Object.freeze([
  "revoked_by_user",
  "revoked_by_admin",
  "password_changed",
  "account_disabled",
  "account_deleted",
  "credentials_rotated",
  "revoked_by_operator",
  "credential_reused"
] as const);

export type ClientGatewayRevocationReason = (typeof CLIENT_GATEWAY_REVOCATION_REASONS)[number];
