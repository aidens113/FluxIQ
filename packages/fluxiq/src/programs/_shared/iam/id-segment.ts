import { createHash } from "node:crypto";
import { FRN_SEGMENT_PATTERN } from "@fluxiq/contracts/iam";

/** The segment a missing id stands as. Encoded ids are `~` plus at least two characters, so none is ever this. */
const MISSING = "~";

const HEX_MAX_BYTES = 63;

/**
 * One payload id as an FRN identifier segment.
 *
 * - `raw`: the id as the payload holds it, or null when it is missing (absent,
 *   not a string, or empty). A missing id stands as the sentinel segment `~`,
 *   whose resource has no owner, so it can never widen access.
 * - `segment`: the id itself when it is already a plain segment that does not
 *   start with `~`; otherwise `~` and its UTF-8 bytes in hex (63 bytes at
 *   most), or `~~` and their SHA-256 in hex. The three forms cannot collide:
 *   only encoded ids start with `~`, and hex never holds one.
 *
 * Principal ids and resource owners are encoded the same way, so
 * `${fluxiq:PrincipalId}` and `fluxiq:ResourceOwner` compare like for like.
 */
export function programIamIdSegment(value: unknown): { raw: string | null; segment: string } {
  if (typeof value !== "string" || value.length === 0) return { raw: null, segment: MISSING };
  if (FRN_SEGMENT_PATTERN.test(value) && !value.startsWith("~")) return { raw: value, segment: value };
  const bytes = Buffer.from(value, "utf8");
  if (bytes.length <= HEX_MAX_BYTES) return { raw: value, segment: `~${bytes.toString("hex")}` };
  return { raw: value, segment: `~~${createHash("sha256").update(bytes).digest("hex")}` };
}
