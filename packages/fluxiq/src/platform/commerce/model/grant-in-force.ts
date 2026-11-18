import type { CommerceEntitlementGrant } from "./types.ts";

/**
 * Whether a grant is in force at `nowMs`: its start is inclusive, its end
 * exclusive, and `extensionMs` (a past-due subscription's grace) carries it
 * past `validUntilMs`. The exclusive end it is in force until is returned so
 * callers bound their own validity by it.
 */
export function grantInForceUntil(grant: CommerceEntitlementGrant, nowMs: number, extensionMs: number): number | null {
  if (!Number.isSafeInteger(grant.validFromMs) || grant.validFromMs < 0 || grant.validFromMs > nowMs) return null;
  if (!Number.isSafeInteger(grant.validUntilMs)) return null;
  const until = grant.validUntilMs + extensionMs;
  return until > nowMs ? until : null;
}
