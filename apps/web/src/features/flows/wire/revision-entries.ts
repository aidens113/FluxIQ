import { asRecord, numberOf, textOf } from "../../home/model";
import type { RevisionEntry } from "./types";

/** `list-graph-revisions`' versions, newest first as sent. Undefined when the answer has no list. */
export function revisionEntries(payload: unknown): RevisionEntry[] | undefined {
  const revisions = asRecord(payload)?.revisions;
  if (!Array.isArray(revisions)) return undefined;
  return revisions.flatMap((value): RevisionEntry[] => {
    const row = asRecord(value);
    const revisionNumber = numberOf(row?.revisionNumber);
    if (!row || revisionNumber === undefined) return [];
    return [{
      revisionNumber,
      madeByLabel: textOf(row.madeByLabel) ?? "Someone",
      message: textOf(row.message) ?? "",
      createdAt: numberOf(row.createdAt) ?? 0,
      snapshotSha256: textOf(row.snapshotSha256) ?? null
    }];
  });
}
