import type { IamAuditOutcome, IamAuditRecord } from "fluxiq/platform";
import type { ActivityPage } from "../../../../../features/security/activity/model";
import { belongsToWorkspace } from "../belongs-to-workspace";
import { formatCursor } from "../format-cursor";
import { parseCursor } from "../parse-cursor";
import { shapeActivityEntry, type JoinedActivityEntry } from "../shape-activity-entry";
import type { ActivityCursor, ActivitySource, AuditReader } from "../types";
import type { AuditActivityAnswer } from "./types";

const PAGE_SIZE = 50;
const BATCH = 200;
// Existing scan pagination carries a cursor at this boundary; it skips no records.
const SCAN_PER_REQUEST = 2000;
// A full page keeps reading, past its limit, only while an outcome row waits for its decision row; this bounds that wait.
const PAIR_GRACE = 200;

const pairKey = (record: IamAuditRecord) => JSON.stringify([record.requestId, record.action]);

/** Existing cursor/scan algorithm, now reusable without a second authorizer or any mutation port. */
export async function assembleAuditActivity(activity: () => Promise<ActivitySource>, cursorText: string | null): Promise<AuditActivityAnswer> {
  const start = cursorText === null ? null : parseCursor(cursorText);
  if (cursorText !== null && start === null) return { status: 400, body: { ok: false, code: "invalid_input", error: "That page of activity could not be read. Reload to start again." } };
  const source = await activity();
  const names = new Map<string, Promise<string | null>>();
  const nameOf = (userId: string) => {
    let name = names.get(userId);
    if (name === undefined) names.set(userId, (name = source.nameOf(userId)));
    return name;
  };
  const entries: JoinedActivityEntry[] = [];
  // Outcome rows read before their decision row (newest first puts them first), by request id and action.
  const waiting = new Map<string, IamAuditOutcome>();
  let stoppedAt: number | null = null;
  let position: ActivityCursor | null = start;
  let insideSecond = start !== null;
  let scanned = 0;
  for (;;) {
    const read = await nextBatch(source.audit, position, insideSecond);
    for (let index = 0; index < read.records.length; index += 1) {
      const record = read.records[index]!;
      position = position !== null && position.t === record.time ? { t: position.t, k: position.k + 1 } : { t: record.time, k: 1 };
      scanned += 1;
      if (record.outcome !== undefined) waiting.set(pairKey(record), record.outcome);
      else {
        const outcome = waiting.get(pairKey(record));
        waiting.delete(pairKey(record));
        if (belongsToWorkspace(record, source.workspaceId, source.tenancy)) entries.push(await shapeActivityEntry(record, nameOf, outcome));
      }
      if (stoppedAt === null && (entries.length >= PAGE_SIZE || scanned >= SCAN_PER_REQUEST)) stoppedAt = scanned;
      // Never stop between an outcome row and its decision row: the outcome is joined when that row is read, never sent alone.
      if (stoppedAt !== null && (waiting.size === 0 || scanned - stoppedAt >= PAIR_GRACE)) {
        const more = index < read.records.length - 1 || read.full || insideSecond;
        return page(entries, more ? position : null);
      }
    }
    if (read.full) insideSecond = true;
    else if (insideSecond) insideSecond = false;
    else return page(entries, null);
  }
}

/** Resume inside the last second first, then older seconds, exactly as the previous authorized reader did. */
async function nextBatch(audit: AuditReader, position: ActivityCursor | null, insideSecond: boolean): Promise<{ records: IamAuditRecord[]; full: boolean }> {
  if (position === null) {
    const records = await audit.read({ limit: BATCH });
    return { records, full: records.length === BATCH };
  }
  if (insideSecond) {
    const rest = (await audit.read({ since: position.t, until: position.t + 1, limit: position.k + BATCH })).slice(position.k);
    return { records: rest, full: rest.length === BATCH };
  }
  const records = await audit.read({ until: position.t, limit: BATCH });
  return { records, full: records.length === BATCH };
}

function page(entries: JoinedActivityEntry[], next: ActivityCursor | null): AuditActivityAnswer {
  const payload: ActivityPage = { entries, next: next === null ? null : formatCursor(next) };
  return { status: 200, body: { ok: true, payload } };
}
