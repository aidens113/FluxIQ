/**
 * The one public client of the connect flow (authorization code with PKCE,
 * RFC 8252 and RFC 7636). Every authorize and token request names it.
 */
export const FLUXIQ_CONNECT_CLIENT_ID = "fluxiq-browser-extension";

/**
 * The connect flow's fixed limits (hosted production plan, Extension Client
 * Sign-In Protocol). Durations are milliseconds.
 *
 * - `authorizationCodeTtlMs`: a code is single use and lives 120 seconds;
 * - `referenceCodeTtlMs`, `referenceCodeLength`: a typed code (Flow B) is
 *   eight characters and lives 10 minutes;
 * - `maxPendingReferenceCodesPerIp`, `maxPendingReferenceCodes`: pending typed
 *   codes, per source address and in total;
 * - `credentialLifetimeMs`: a credential slides to 60 days on every connect;
 * - `previousCredentialGraceMs`: the credential a connect replaced stays valid
 *   once for 2 minutes; presenting an older one revokes the client;
 * - `maxConnectedClientsPerAccount`: under the `service` profile.
 */
export const FLUXIQ_CONNECT_LIMITS = Object.freeze({
  authorizationCodeTtlMs: 120_000,
  referenceCodeTtlMs: 600_000,
  referenceCodeLength: 8,
  maxPendingReferenceCodesPerIp: 5,
  maxPendingReferenceCodes: 1_000,
  credentialLifetimeMs: 60 * 24 * 60 * 60 * 1_000,
  previousCredentialGraceMs: 120_000,
  maxConnectedClientsPerAccount: 10
} as const);
