import { asRecord } from "./as-record";
import { numberOf } from "./number-of";
import { textOf } from "./text-of";
import type { HomeClient } from "./types";

/** The engine's `list-clients` answer (a list, or an object holding one) as clients. Rows without an id are dropped. */
export function readClients(payload: unknown): HomeClient[] {
  const list = Array.isArray(payload) ? payload : asRecord(payload)?.clients;
  if (!Array.isArray(list)) return [];
  return list.flatMap((raw) => {
    const row = asRecord(raw);
    const clientId = textOf(row?.clientId);
    if (!row || !clientId) return [];
    const client: HomeClient = { clientId, label: textOf(row.label) ?? clientId, transport: textOf(row.transport) ?? "", status: textOf(row.status) ?? "" };
    const lastSeenAt = numberOf(row.lastSeenAt);
    if (lastSeenAt !== undefined) client.lastSeenAt = lastSeenAt;
    return [client];
  });
}
