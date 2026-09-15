import { createHash } from "node:crypto";

/**
 * The SHA-256 digest a session is stored and looked up under. A session id is
 * the cookie's bearer value, so it is never stored itself, just as Client
 * Gateway stores only token digests.
 */
export function digestSessionId(sessionId: string): string {
  return createHash("sha256").update(sessionId, "utf8").digest("hex");
}
