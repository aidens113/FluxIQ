import type { AutomationStudioSqlExecutor } from "../database.ts";
import { AUTOMATION_STUDIO_CHANGE_FEED_RETENTION, type AutomationStudioChangeFeedRetention } from "./policy.ts";

/** What a prune did: nothing yet (it ran recently), or deleted rows up to `prunedThrough`. */
export type AutomationStudioChangeFeedPruneResult =
  | { kind: "not_due"; prunedThrough: number }
  | { kind: "pruned"; deleted: number; prunedThrough: number };

type RetentionRow = { pruned_through_sequence: number; pruned_at_ms: number };

/**
 * Deletes the change feed rows older than the retention window, always keeping the newest
 * `keepRows`, and raises the watermark to the last sequence deleted. Run it inside the caller's
 * write transaction, so the deletion and the watermark commit together with the write.
 */
export async function pruneAutomationStudioChangeFeed(sql: AutomationStudioSqlExecutor, input: { now?: number; retention?: AutomationStudioChangeFeedRetention; force?: boolean } = {}): Promise<AutomationStudioChangeFeedPruneResult> {
  const now = input.now ?? Date.now();
  const retention = input.retention ?? AUTOMATION_STUDIO_CHANGE_FEED_RETENTION;
  const current = await sql.get<RetentionRow>("select pruned_through_sequence, pruned_at_ms from change_feed_retention where singleton = 1");
  const previous = current?.pruned_through_sequence ?? 0;
  if (!input.force && current && now - current.pruned_at_ms < retention.pruneEveryMs) return { kind: "not_due", prunedThrough: previous };
  const cutoff = await sql.get<{ sequence: number | null }>(
    `select max(sequence) as sequence from change_feed
     where changed_at_ms < ? and sequence <= (select coalesce(max(sequence), 0) from change_feed) - ?`,
    [now - retention.keepMs, Math.max(0, Math.trunc(retention.keepRows))]
  );
  const through = Math.max(previous, cutoff?.sequence ?? 0);
  const deleted = through > 0 ? (await sql.run("delete from change_feed where sequence <= ?", [through])).changes : 0;
  await sql.run(
    `insert into change_feed_retention (singleton, pruned_through_sequence, pruned_at_ms) values (1, ?, ?)
     on conflict(singleton) do update set pruned_through_sequence = max(change_feed_retention.pruned_through_sequence, excluded.pruned_through_sequence), pruned_at_ms = excluded.pruned_at_ms`,
    [through, now]
  );
  return { kind: "pruned", deleted, prunedThrough: through };
}
