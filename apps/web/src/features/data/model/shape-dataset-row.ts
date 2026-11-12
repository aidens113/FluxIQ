import { asRecord, numberOf, textOf } from "../../home/model";
import type { DatasetRow } from "./types";

/** One `list-project-datasets` summary as a Data row, or undefined when it cannot be linked to (no Flow, table, run or time). */
export function shapeDatasetRow(raw: unknown, projectId: string, flowNames: ReadonlyMap<string, string>): DatasetRow | undefined {
  const row = asRecord(raw);
  const flowId = textOf(row?.flowId);
  const datasetId = textOf(row?.datasetId);
  const runId = textOf(row?.latestRunId);
  const collectedAt = numberOf(row?.latestUpdatedAt);
  if (!row || !flowId || !datasetId || !runId || collectedAt === undefined) return undefined;
  return {
    projectId,
    flowId,
    flowName: flowNames.get(flowId) ?? "A Flow",
    runId,
    datasetId,
    name: textOf(row.label) ?? datasetId,
    rowCount: numberOf(row.latestRecordCount) ?? 0,
    collectedAt,
    runCount: numberOf(row.runCount) ?? 1,
    truncated: row.latestTruncated === true
  };
}
