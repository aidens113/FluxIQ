/** How much of a project's change feed is kept, and how often pruning looks. */
export type AutomationStudioChangeFeedRetention = {
  /** Rows younger than this are always kept. */
  keepMs: number;
  /** The newest this many rows are always kept, however old. */
  keepRows: number;
  /** Pruning runs at most this often per project database. */
  pruneEveryMs: number;
};

/**
 * Its readers are clients that poll the feed with a cursor (`listProjectChangeFeed`) and catch up
 * after being away. Seven days covers a laptop closed over a long weekend; a reader away longer
 * gets a resync and reloads, which is always correct, only slower. Pruning looks hourly, from
 * project mutations, so an idle project costs nothing.
 */
export const AUTOMATION_STUDIO_CHANGE_FEED_RETENTION: AutomationStudioChangeFeedRetention = Object.freeze({
  keepMs: 7 * 24 * 60 * 60 * 1000,
  keepRows: 1_000,
  pruneEveryMs: 60 * 60 * 1000
});
