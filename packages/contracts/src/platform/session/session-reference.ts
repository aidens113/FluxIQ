import { isSessionDigest } from "./session-digest.ts";

/**
 * The prefix of a gateway session reference: `client-gateway:<gateway session id>`,
 * the session a connected client's own work runs under.
 */
export const GATEWAY_SESSION_REFERENCE_PREFIX = "client-gateway:";

const GATEWAY_SESSION_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/u;

/**
 * True for a reference to the session work started from, as it may travel to
 * a client: a panel session's digest (`isSessionDigest`), or
 * `client-gateway:<gateway session id>`. A raw panel session id is refused,
 * because it is the panel cookie's bearer value.
 */
export function isSessionReference(value: unknown): value is string {
  if (isSessionDigest(value)) return true;
  if (typeof value !== "string" || !value.startsWith(GATEWAY_SESSION_REFERENCE_PREFIX)) return false;
  return GATEWAY_SESSION_ID_PATTERN.test(value.slice(GATEWAY_SESSION_REFERENCE_PREFIX.length));
}
