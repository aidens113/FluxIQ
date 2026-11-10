import { resultGroup } from "./result-group";
import type { RunFilter, RunRow } from "./types";

/** The runs that pass every filter, newest first. */
export function filterRuns(rows: readonly RunRow[], filter: RunFilter): RunRow[] {
  return rows
    .filter((row) => filter.flowId === "any" || row.flowId === filter.flowId)
    .filter((row) => filter.client === "any" || (filter.client === "unknown" ? row.client === undefined : row.client === filter.client))
    .filter((row) => filter.result === "any" || resultGroup(row.status) === filter.result)
    .sort((a, b) => b.startedAt - a.startedAt);
}
