import { createHash } from "node:crypto";
import { canonicalJson } from "./canonical-json.ts";

/**
 * The idempotency digest of a parsed operation input: SHA-256 hex of its
 * canonical JSON with `password` removed, so the stored record never derives
 * from a password and a retry with the same fields matches.
 */
export function provisioningInputDigest(input: object): string {
  const withoutPassword: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) if (key !== "password") withoutPassword[key] = value;
  return createHash("sha256").update(canonicalJson(withoutPassword)).digest("hex");
}
