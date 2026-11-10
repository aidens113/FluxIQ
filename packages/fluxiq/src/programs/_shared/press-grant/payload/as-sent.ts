/**
 * A payload as JSON sends it: what `JSON.stringify` writes, read back. Only
 * own enumerable fields survive; an `undefined` field is absent, a `toJSON`
 * has been applied, and nothing is inherited. A missing payload stays missing,
 * and one JSON cannot write as a value (a function) reads as `null`.
 *
 * Both the grant's digest (`pressGrantPayloadDigest`) and `call()` read a
 * destructive payload through this, so the act a grant was minted for is the
 * act IAM decides on and the handler performs: there is no second reading of
 * the payload the digest could not see. Throws a `TypeError` for a payload
 * JSON cannot write at all (a cycle, a BigInt).
 */
export function payloadAsSent(payload: unknown): unknown {
  return payload === undefined ? undefined : JSON.parse(JSON.stringify(payload) ?? "null");
}
