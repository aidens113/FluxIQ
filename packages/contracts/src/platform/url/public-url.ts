import { isLoopbackHostname } from "./is-loopback-hostname.ts";

/** Which URL family a check is for: `http` (`https:`, or `http:` on loopback) or `ws` (`wss:`, or `ws:` on loopback). */
export type PublicUrlFamily = "http" | "ws";

const SECURE_SCHEME: Readonly<Record<PublicUrlFamily, string>> = Object.freeze({ http: "https:", ws: "wss:" });
const PLAIN_SCHEME: Readonly<Record<PublicUrlFamily, string>> = Object.freeze({ http: "http:", ws: "ws:" });

/** The longest absolute URL the platform contracts accept. */
export const PUBLIC_URL_MAX_LENGTH = 2048;

/**
 * True for an absolute URL a client may follow: the family's secure scheme on
 * any host, or its plain scheme only on a loopback host; no user name or
 * password and no fragment.
 */
export function isSecureOrLoopbackUrl(value: unknown, family: PublicUrlFamily): value is string {
  if (typeof value !== "string" || value.length > PUBLIC_URL_MAX_LENGTH || !URL.canParse(value)) return false;
  const url = new URL(value);
  if (url.username !== "" || url.password !== "" || url.hash !== "" || url.hostname === "") return false;
  if (url.protocol === SECURE_SCHEME[family]) return true;
  return url.protocol === PLAIN_SCHEME[family] && isLoopbackHostname(url.hostname);
}

/**
 * True for an origin as a browser serialises it (`https://app.example.com`,
 * `http://127.0.0.1:3000`): scheme, host and port only, in canonical form,
 * `https:` anywhere or `http:` on loopback.
 */
export function isSecureOrLoopbackOrigin(value: unknown): value is string {
  return isSecureOrLoopbackUrl(value, "http") && new URL(value).origin === value;
}
