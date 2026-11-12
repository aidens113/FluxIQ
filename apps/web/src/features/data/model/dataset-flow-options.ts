import type { DatasetRow } from "./types";

/** The Flows that have tables, by name, for the Flow filter. */
export function datasetFlowOptions(rows: readonly DatasetRow[]): Array<{ flowId: string; name: string }> {
  const seen = new Map<string, string>();
  for (const row of rows) if (!seen.has(row.flowId)) seen.set(row.flowId, row.flowName);
  return [...seen].map(([flowId, name]) => ({ flowId, name })).sort((a, b) => a.name.localeCompare(b.name));
}
