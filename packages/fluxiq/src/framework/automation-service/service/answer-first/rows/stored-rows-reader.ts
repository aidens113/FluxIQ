import type { AutomationStudioRunDatasetPage, AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation";

/**
 * How the stored rows are read back, bound by the driver to the service's run
 * datasets: `listDatasets` is `listRunDatasetsForVerification`, `getPage` is
 * `getRunDatasetPage`, and `process` is `processEndedRunDatasets`, which turns
 * the collected rows into the dataset's answer (default processing drops a row
 * repeated whole).
 */
export type AutomationStudioAnswerFirstRowReader = {
  listDatasets(): Promise<AutomationStudioRunDatasetSummary[]>;
  getPage(input: { datasetId: string; limit: number; cursor?: string }): Promise<AutomationStudioRunDatasetPage | null>;
  process?(): Promise<void>;
};
