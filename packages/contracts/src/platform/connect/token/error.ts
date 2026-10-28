import { z } from "zod";

/**
 * Why a token request failed, in the OAuth error body shape
 * `{ error, error_description? }` with HTTP 400 (401 for `invalid_client`,
 * 429 for `rate_limited`):
 *
 * - `invalid_request`: a field is missing or ill-formed;
 * - `invalid_client`: `client_id` is not the connect client;
 * - `invalid_grant`: the code is unknown, used, expired, or bound to another
 *   verifier, install id or redirect URI;
 * - `unsupported_grant_type`: `grant_type` is not `authorization_code`;
 * - `email_unverified`: under `service`, the user must verify their email first;
 * - `client_limit_reached`: the account already has the most connected clients;
 * - `account_disabled`: the account cannot sign in;
 * - `rate_limited`: too many requests from this source.
 *
 * `error_description` is for a person and never holds the code or verifier.
 */
export const CONNECT_TOKEN_ERROR_CODES = Object.freeze([
  "invalid_request",
  "invalid_client",
  "invalid_grant",
  "unsupported_grant_type",
  "email_unverified",
  "client_limit_reached",
  "account_disabled",
  "rate_limited"
] as const);

export type ConnectTokenErrorCode = (typeof CONNECT_TOKEN_ERROR_CODES)[number];

export const connectTokenErrorSchema = z.object({
  error: z.enum(CONNECT_TOKEN_ERROR_CODES),
  error_description: z.string().max(500).optional()
});

export type ConnectTokenError = z.infer<typeof connectTokenErrorSchema>;
