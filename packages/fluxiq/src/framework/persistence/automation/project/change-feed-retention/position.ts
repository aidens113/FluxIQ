import type { AutomationStudioSqlExecutor } from "../database.ts";

/**
 * Where a change feed reader stands against retention. `resync` is true when rows after `after`
 * may already be pruned: the reader must reload what it shows and continue from `head`, the last
 * sequence written, rather than page on and silently miss changes.
 */
export type AutomationStudioChangeFeedPosition = { resync: boolean; prunedThrough: number; head: number };

export async function automationStudioChangeFeedPosition(sql: AutomationStudioSqlExecutor, after: number): Promise<AutomationStudioChangeFeedPosition> {
  const row = await sql.get<{ prunedThrough: number | null; head: number | null }>(
    `select (select pruned_through_sequence from change_feed_retention where singleton = 1) as prunedThrough,
            (select seq from sqlite_sequence where name = 'change_feed') as head`
  );
  const prunedThrough = row?.prunedThrough ?? 0;
  return { resync: Math.max(0, Math.trunc(after)) < prunedThrough, prunedThrough, head: row?.head ?? 0 };
}
