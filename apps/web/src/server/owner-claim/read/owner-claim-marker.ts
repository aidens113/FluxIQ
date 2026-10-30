import { readFile } from "node:fs/promises";
import { ownerClaimPaths } from "../owner-claim-paths";
import type { OwnerClaimMarker } from "../types";

/**
 * The claimed marker, or null when the instance is unclaimed (no marker
 * file). A marker that exists but cannot be parsed still means claimed:
 * reopening `/setup` because a file was damaged would hand the instance to
 * whoever holds an old code. Any other read failure propagates.
 */
export async function readOwnerClaimMarker(fluxiqDir: string): Promise<OwnerClaimMarker | null> {
  let text: string;
  try {
    text = await readFile(ownerClaimPaths(fluxiqDir).marker, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  let parsed: Partial<OwnerClaimMarker> = {};
  try {
    parsed = JSON.parse(text) as Partial<OwnerClaimMarker>;
  } catch {
    /* best-effort: a damaged marker still means claimed, so its fields are left blank */
  }
  return { schemaVersion: 1, claimedAt: String(parsed.claimedAt ?? ""), ownerUserId: String(parsed.ownerUserId ?? "") };
}
