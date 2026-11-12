import { asRecord, numberOf, textOf } from "../../../home/model";
import type { PairedClientRow } from "../types";

/** Picks the visible fields of one trusted browser. The client gateway already withholds its credential hashes; this takes none of them. */
export function shapePairedClient(raw: unknown): PairedClientRow | undefined {
  const record = asRecord(raw);
  const trustedClientId = textOf(record?.trustedClientId);
  if (!record || !trustedClientId) return undefined;
  return {
    trustedClientId,
    name: textOf(record.name) ?? trustedClientId,
    clientType: textOf(record.clientType) ?? "browser",
    status: textOf(record.status) ?? "active",
    approvedAt: numberOf(record.approvedAt),
    lastUsedAt: numberOf(record.lastUsedAt)
  };
}
