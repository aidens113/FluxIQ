import { asRecord, numberOf, textOf } from "../../../home/model";
import type { KeyRow } from "../types";

/** Picks only the fields the screen shows, so a key's value can never reach it. */
export function shapeKeyRow(raw: unknown): KeyRow | undefined {
  const record = asRecord(raw);
  const id = textOf(record?.id);
  if (!record || !id) return undefined;
  const lock = record.unlocked === true ? "unlocked" : record.unlocked === false ? "locked" : "unknown";
  return {
    id,
    name: textOf(record.name) ?? id,
    provider: textOf(record.provider) ?? textOf(record.kind) ?? "not named",
    addedAt: numberOf(record.createdAtMs),
    lastRevealedAt: numberOf(record.lastRevealedAtMs),
    enabled: record.enabled !== false,
    lock
  };
}
