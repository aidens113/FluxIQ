// Bounded reads of a run's stored datasets, following `runtime/run-queries.ts:15-17`:
// one function per endpoint, the transport passed in, and the payload shape
// written out so a renamed field shows up here.

import type { ProgramCommandTransport } from "../data/program-transport";
import type { RunDatasetExport, RunDatasetExportFormat, RunDatasetPage, RunDatasetSummary } from "./types";

/** The server clamps 1-200 and defaults to 50 (`AS/storage/paging.ts`, C11). */
export const RUN_DATASET_PAGE_SIZE = 50;

export function listRunDatasets(
  api: ProgramCommandTransport,
  payload: { projectId: string; runId: string },
  signal?: AbortSignal
) {
  return api.post<{ datasets?: RunDatasetSummary[] }>("list-run-datasets", payload, signal ? { signal } : {});
}

export function getRunDatasetPage(
  api: ProgramCommandTransport,
  payload: { projectId: string; runId: string; datasetId: string; limit: number; cursor?: string | null },
  signal?: AbortSignal
) {
  return api.post<{ dataset?: RunDatasetPage | null }>("get-run-dataset-page", payload, signal ? { signal } : {});
}

export function exportRunDataset(
  api: ProgramCommandTransport,
  payload: { projectId: string; runId: string; datasetId: string; format: RunDatasetExportFormat }
) {
  return api.post<{ export?: RunDatasetExport }>("export-run-dataset", payload);
}
