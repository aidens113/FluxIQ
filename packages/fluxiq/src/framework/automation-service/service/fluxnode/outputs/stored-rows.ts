// The rows an attempt's result names, read back whole from the run dataset that stores them: the
// result carries only a preview (`AutomationStudioTaskResultRows.previewRows`), and outputs are every
// row. Read through the same seam a trial reads datasets through (`../../trial-ports/`), page by page,
// up to the result's own count. A dataset that cannot be read gives its preview, which is still rows a
// real read stored, and the result says how many there were.

import type { AutomationStudioTaskResultRows } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../../../core/index.ts";
import { AutomationStudioServiceTrialCollaboratorRegistry } from "../../trial-ports/collaborator-registry.ts";

const PAGE = 200;

export type FluxNodeStoredRows = { datasetId: string; columns: { id: string; label: string }[]; rows: JsonObject[] };

export async function fluxNodeStoredRows(owner: object, projectId: string, shown: AutomationStudioTaskResultRows): Promise<FluxNodeStoredRows> {
  const columns = shown.columns.map((column) => ({ id: column.id, label: column.label }));
  const preview = { datasetId: shown.datasetId, columns, rows: shown.previewRows.map((row) => structuredClone(row)) };
  if (shown.previewRows.length >= shown.totalRows) return preview;
  const datasets = AutomationStudioServiceTrialCollaboratorRegistry.of(owner)?.runDatasets();
  if (!datasets?.available) return preview;
  const rows: JsonObject[] = [];
  let cursor: string | null = null;
  do {
    const page = await datasets.getRunDatasetPage({ projectId, runId: shown.runId, datasetId: shown.datasetId, limit: PAGE, ...(cursor === null ? {} : { cursor }) });
    if (!page) return preview;
    rows.push(...page.rows);
    cursor = page.nextCursor;
  } while (cursor !== null && rows.length < shown.totalRows);
  return { datasetId: shown.datasetId, columns, rows: rows.slice(0, shown.totalRows) };
}
