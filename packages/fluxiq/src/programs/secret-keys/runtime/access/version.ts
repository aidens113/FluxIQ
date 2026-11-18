import { isDeepStrictEqual } from "node:util";
import type { SecretKeyRecord } from "../../types.ts";

/** Every semantic field counts, even under a fixed clock; only reveal audit time is exempt. */
export function sameSecretKeyVersion(left: SecretKeyRecord | undefined, right: SecretKeyRecord): boolean {
  if (!left) return false;
  const { lastRevealedAtMs: leftAudit, ...leftVersion } = left;
  const { lastRevealedAtMs: rightAudit, ...rightVersion } = right;
  void leftAudit;
  void rightAudit;
  return isDeepStrictEqual(leftVersion, rightVersion);
}
