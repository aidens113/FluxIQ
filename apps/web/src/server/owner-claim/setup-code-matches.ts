import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** True when the typed code (trimmed) equals the expected one, compared by SHA-256 digest in constant time so length and content leak nothing. */
export function setupCodeMatches(given: string, expected: string): boolean {
  return timingSafeEqual(digest(given.trim()), digest(expected));
}
