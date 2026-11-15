import { createHash } from "node:crypto";
import { PAIRED_CLIENT_UNLOCK_PREFIX } from "@fluxiq/contracts/platform";

/** The SHA-256 digest Identity Access stores a session under; never the raw cookie. */
export function secretKeySessionDigest(sessionId: string): string {
  return createHash("sha256").update(sessionId, "utf8").digest("hex");
}

/** The stored id of a panel session's unlock: its digest, never its raw id. */
export function secretKeyPanelHolderId(digest: string): string {
  return `panel-session:${digest}`;
}

/** Public holder identity; the actual held unlock uses a separate random handle. */
export function secretKeyPairedHolderId(trustedClientId: string): string {
  return `${PAIRED_CLIENT_UNLOCK_PREFIX}${trustedClientId}`;
}
