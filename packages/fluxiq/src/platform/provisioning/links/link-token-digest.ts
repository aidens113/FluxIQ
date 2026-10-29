import { createHash } from "node:crypto";

/** The stored form of a link token: its SHA-256 hex digest. The token itself is never stored. */
export function linkTokenDigest(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
