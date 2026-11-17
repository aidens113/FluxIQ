import { asRecord, numberOf, textOf } from "../../home/model";

/** A browser or app asking to pair, waiting for a person here to approve or dismiss it. */
export type PendingPairing = { pairingCode: string; reference: string; name: string; expiresAt: number };

/** Picks the waiting requests from the gateway snapshot pairings: not yet approved, not expired, and tied to a client that is still connected. */
export function pendingPairings(raw: unknown, now: number): PendingPairing[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const record = asRecord(item);
    const pairingCode = textOf(record?.pairingCode);
    const expiresAt = numberOf(record?.expiresAt);
    if (!record || !pairingCode || expiresAt === undefined || expiresAt <= now) return [];
    if (!textOf(record.requestedBySessionId) || record.consumedAt) return [];
    return [{ pairingCode, reference: textOf(record.referenceCode) ?? pairingCode, name: textOf(record.requestedByClientName) ?? "Browser extension", expiresAt }];
  });
}
