// The content digest of a reusable LLM context (t745 design note D2). A
// protected store writes the keyed address of the encoded prompt projection
// (64 lower hex) and names the key it was made under; a row whose key id is
// null holds the plain SHA-256 that older code wrote. A digest is only ever
// compared for equality within one project and checked against the content it
// names, so neither form has to match anything outside the project.
import { createHash, timingSafeEqual } from "node:crypto";
import type { AutomationStudioContentAddressKeyring } from "../content-address/index.ts";

export type ReusableLlmContextDigest = { digest: string; keyId: string };

/** The keyed digest of `content` under the keyring's current key. */
export function keyedReusableLlmContextDigest(keyring: AutomationStudioContentAddressKeyring, content: Uint8Array): ReusableLlmContextDigest {
  const digest = keyring.address("reusable-llm-context", content).toString("hex");
  return { digest, keyId: keyring.currentKeyId };
}

/**
 * Whether `digest` names `content` in the row's own form: the plain SHA-256
 * when `keyId` is null, otherwise the keyed address under that key. A key the
 * keyring does not hold, or no keyring at all, cannot verify a keyed digest.
 */
export function reusableLlmContextDigestMatches(input: {
  keyring: AutomationStudioContentAddressKeyring | undefined;
  content: Uint8Array;
  digest: string;
  keyId: string | null;
}): boolean {
  const expected = expectedDigest(input);
  if (expected === undefined) return false;
  const actual = Buffer.from(input.digest, "utf8");
  const wanted = Buffer.from(expected, "utf8");
  if (actual.byteLength !== wanted.byteLength) return false;
  return timingSafeEqual(actual, wanted);
}

function expectedDigest(input: { keyring: AutomationStudioContentAddressKeyring | undefined; content: Uint8Array; keyId: string | null }): string | undefined {
  if (input.keyId === null) return createHash("sha256").update(input.content).digest("hex");
  if (!input.keyring) return undefined;
  if (!input.keyring.holds(input.keyId)) return undefined;
  return input.keyring.addressWith(input.keyId, "reusable-llm-context", input.content).toString("hex");
}
