import { createHash } from "node:crypto";

/**
 * The stored form of a welcome link's token: its SHA-256 hex digest, as
 * provisioning stores it (`linkTokenDigest` in Core's
 * `platform/provisioning/links`, which its barrel keeps internal). The page
 * looks a link up by it without spending it; the token itself is never kept.
 */
export function welcomeLinkDigest(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
