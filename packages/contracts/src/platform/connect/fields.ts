import { z } from "zod";
import { isSecureOrLoopbackUrl } from "../url/index.ts";
import { FLUXIQ_CONNECT_CLIENT_ID } from "./client.ts";
import { FLUXIQ_CONNECT_PATHS } from "./paths.ts";
import { PKCE_CODE_VERIFIER_PATTERN, PKCE_S256_CHALLENGE_PATTERN } from "./pkce.ts";

/**
 * The field shapes the connect messages share:
 *
 * - `clientId`: always `FLUXIQ_CONNECT_CLIENT_ID`;
 * - `redirectUri`: `<instance origin>/connect/done`, nothing else
 *   (`connectRedirectUri`); the authorize page also checks the origin is its own;
 * - `state`: 16 to 256 unreserved characters the client generated;
 * - `installId`: the client's id for its install on this server, 8 to 128
 *   unreserved characters (a UUID fits);
 * - `label`: the person-readable name the consent page shows, 1 to 100
 *   characters without control characters;
 * - `code`: the authorization code, 32 random bytes base64url (43 characters);
 * - `codeVerifier`, `codeChallenge`: the PKCE shapes.
 */
export const connectFieldSchemas = Object.freeze({
  clientId: z.literal(FLUXIQ_CONNECT_CLIENT_ID),
  redirectUri: z
    .string()
    .refine((value) => isSecureOrLoopbackUrl(value, "http") && new URL(value).pathname === FLUXIQ_CONNECT_PATHS.done && new URL(value).search === "", "<origin>/connect/done"),
  state: z.string().regex(/^[A-Za-z0-9\-._~]{16,256}$/u),
  installId: z.string().regex(/^[A-Za-z0-9\-._~]{8,128}$/u),
  label: z.string().min(1).max(100).regex(/^[^\u0000-\u001f\u007f]+$/u),
  code: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
  codeVerifier: z.string().regex(PKCE_CODE_VERIFIER_PATTERN),
  codeChallenge: z.string().regex(PKCE_S256_CHALLENGE_PATTERN)
});

/** The only redirect URI an instance accepts: its own origin plus `/connect/done`. */
export function connectRedirectUri(instanceOrigin: string): string {
  return `${instanceOrigin}${FLUXIQ_CONNECT_PATHS.done}`;
}
