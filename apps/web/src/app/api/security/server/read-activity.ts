import type { IamAuditRecord } from "fluxiq/platform";
import type { ActivityEntry, ActivityPage } from "../../../../features/security/activity/model";
import { refuseAccounts, type AccountsResponse } from "../../accounts/server";
import { authorizeAuditRoute } from "./authorize-audit-route";
import { belongsToWorkspace } from "./belongs-to-workspace";
import { formatCursor } from "./format-cursor";
import { parseCursor } from "./parse-cursor";
import { shapeActivityEntry } from "./shape-activity-entry";
import type { ActivityCursor, AuditReader, AuditRouteDeps } from "./types";

/** Entries in one page. */
const PAGE_SIZE = 50;
/** Records asked of the audit at a time. */
const BATCH = 200;
/**
 * Records one request looks through. The audit is shared by every workspace,
 * so a page of this workspace's entries can lie behind many of others'; a
 * request that has looked through this many answers what it found with a
 * cursor, and the next page carries on from there. Nothing is skipped.
 */
const SCAN_PER_REQUEST = 2000;

/**
 * `GET /api/security/audit[?cursor=]`: the caller's workspace's activity,
 * newest first, a page at a time. In order:
 *
 * 1. IAM decides `iam:ListAuditEvents` on the workspace (and audits it);
 * 2. the cursor, if any, is one this route wrote (else 400);
 * 3. the audit is read from the cursor on, and only records that belong to
 *    the caller's workspace (`belongsToWorkspace`, from the session's
 *    workspace, never from the request) become entries, each built from an
 *    allow-list of fields (`shapeActivityEntry`).
 *
 * The audit is read in batches. A cursor names a second and how many of its
 * records were read, so a page that ends inside a busy second resumes there:
 * the rest of that second is read alone (`since` and `until` both bound it,
 * so a cursor can never make one read larger than that second), then older
 * seconds. Records written later in an already-read second can repeat an
 * entry on the next page; none is lost.
 */
export async function readActivity(deps: AuditRouteDeps, cursorText: string | null): Promise<AccountsResponse> {
  const refusal = await authorizeAuditRoute(deps);
  if (refusal) return refusal;
  const start = cursorText === null ? null : parseCursor(cursorText);
  if (cursorText !== null && start === null) return refuseAccounts(400, "invalid_input", "That page of activity could not be read. Reload to start again.");
  const source = await deps.activity();
  const names = new Map<string, Promise<string | null>>();
  const nameOf = (userId: string) => {
    let name = names.get(userId);
    if (name === undefined) names.set(userId, (name = source.nameOf(userId)));
    return name;
  };

  const entries: ActivityEntry[] = [];
  let position: ActivityCursor | null = start;
  // Inside a second whose remaining records are still to be read.
  let insideSecond = start !== null;
  let scanned = 0;
  for (;;) {
    const read = await nextBatch(source.audit, position, insideSecond);
    for (let index = 0; index < read.records.length; index += 1) {
      const record = read.records[index]!;
      position = position !== null && position.t === record.time ? { t: position.t, k: position.k + 1 } : { t: record.time, k: 1 };
      scanned += 1;
      if (belongsToWorkspace(record, source.workspaceId, source.tenancy)) entries.push(await shapeActivityEntry(record, nameOf));
      if (entries.length === PAGE_SIZE || scanned >= SCAN_PER_REQUEST) {
        const more = index < read.records.length - 1 || read.full || insideSecond;
        return page(entries, more ? position : null);
      }
    }
    // A full batch may stop inside a second; anything less finished what it asked for.
    if (read.full) insideSecond = true;
    else if (insideSecond) insideSecond = false;
    else return page(entries, null);
  }
}

/**
 * The next records after `position`: the rest of its second when `insideSecond`,
 * else the newest records older than it (or the newest of all, from the start).
 * `full` says the batch was as large as asked, so more may follow.
 */
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

function page(entries: ActivityEntry[], next: ActivityCursor | null): AccountsResponse {
  const payload: ActivityPage = { entries, next: next === null ? null : formatCursor(next) };
  return { status: 200, body: { ok: true, payload } };
}
