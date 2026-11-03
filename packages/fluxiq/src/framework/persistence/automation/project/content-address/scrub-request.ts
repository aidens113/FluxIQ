// Recording that a project database needs a scrub (t745 u5). A transaction
// that converts or deletes an old plaintext form (a plain digest, a plaintext
// body or manifest, a released object's row) calls this inside itself, so the
// request commits with the change or not at all. `secure_delete` zeroes a
// deleted cell, but a page rebuilt by B-tree balancing keeps stale bytes in its
// free gap, and the WAL keeps old page images: only `scrubProjectDatabaseIfRequested`
// (VACUUM, then a truncate checkpoint) removes them.
//
// The single row's time only ever grows, even within one millisecond, so a
// scrub that started before a later request clears only the request it saw.
import type { AutomationStudioSqlExecutor } from "../database.ts";

export async function requestContentAddressScrub(sql: AutomationStudioSqlExecutor, now: number): Promise<void> {
  if (!Number.isFinite(now)) throw new Error("A content address scrub request needs a finite time.");
  await sql.run(
    `insert into content_address_scrub_requests (singleton, requested_at_ms) values (1, ?)
     on conflict(singleton) do update set requested_at_ms = max(excluded.requested_at_ms, content_address_scrub_requests.requested_at_ms + 1)`,
    [Math.trunc(now)]
  );
}
