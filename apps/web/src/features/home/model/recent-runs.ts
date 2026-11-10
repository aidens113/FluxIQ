import type { HomeRun } from "./types";

export const RECENT_RUN_ROWS = 10;

/** The newest runs first, across every project. */
export function recentRuns(runs: readonly HomeRun[], rows: number = RECENT_RUN_ROWS): HomeRun[] {
  return [...runs].sort((a, b) => b.startedAt - a.startedAt).slice(0, rows);
}
