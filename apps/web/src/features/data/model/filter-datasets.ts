import type { DatasetFilter, DatasetRow } from "./types";

/** The tables matching the filter, newest first. The search looks in the table's name, id and Flow name. */
export function filterDatasets(rows: readonly DatasetRow[], filter: DatasetFilter): DatasetRow[] {
  const needle = filter.search.trim().toLowerCase();
  return rows
    .filter((row) => (filter.flowId === "any" || row.flowId === filter.flowId)
      && (needle === "" || [row.name, row.datasetId, row.flowName].some((text) => text.toLowerCase().includes(needle))))
    .sort((a, b) => b.collectedAt - a.collectedAt);
}
