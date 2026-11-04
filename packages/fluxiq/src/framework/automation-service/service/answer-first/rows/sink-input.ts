import type { AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation";
import type { AutomationStudioRecordBatch } from "../../../../../engine/automation/contracts.ts";
import type { AutomationStudioAnswerFirstRowReader } from "./stored-rows-reader.ts";

export type AutomationStudioAnswerFirstRowSinkInput = {
  runId: string;
  /** Where a live read's answer holds its kept rows, as the bound domain declared it. */
  readRowsKey?: string | undefined;
  /** `AutomationStudioRunDatasets.recordBatchHandler(projectId, runId)`. */
  onRecordBatch: (batch: AutomationStudioRecordBatch) => Promise<AutomationStudioRunDatasetSummary>;
  /** Reads the stored rows back for `readBack`; absent, `readBack` answers from what the sink stored. */
  reader?: AutomationStudioAnswerFirstRowReader | undefined;
};
