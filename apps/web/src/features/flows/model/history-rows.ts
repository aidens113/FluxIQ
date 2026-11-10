import { agoText } from "../../home/model";
import type { RevisionEntry } from "../wire";
import type { HistoryRow } from "./types";

/**
 * The history drawer's rows, newest first: who saved each version, why, and when. The version
 * the Flow is at now is marked and cannot be restored onto itself; an older version without a
 * kept restore point says so instead of offering Restore.
 */
export function historyRows(entries: readonly RevisionEntry[], currentRevision: number, now: number): HistoryRow[] {
  return [...entries]
    .sort((a, b) => b.revisionNumber - a.revisionNumber)
    .map((entry) => {
      const current = entry.revisionNumber === currentRevision;
      const row: HistoryRow = {
        revisionNumber: entry.revisionNumber,
        title: `Version ${entry.revisionNumber}`,
        who: entry.madeByLabel,
        why: entry.message || "No note was saved with this version.",
        when: agoText(entry.createdAt || undefined, now),
        current
      };
      if (!current && entry.snapshotSha256) row.snapshotSha256 = entry.snapshotSha256;
      return row;
    });
}
