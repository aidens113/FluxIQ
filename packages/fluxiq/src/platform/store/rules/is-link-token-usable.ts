import type { PlatformLinkPurpose, PlatformLinkTokenRecord } from "../types.ts";

/** A token can be consumed when its purpose matches, it is unused and `expiresAtMs > nowMs`. */
export function isLinkTokenUsable(record: PlatformLinkTokenRecord, purpose: PlatformLinkPurpose, nowMs: number): boolean {
  return record.purpose === purpose && record.usedAtMs === null && record.expiresAtMs > nowMs;
}
