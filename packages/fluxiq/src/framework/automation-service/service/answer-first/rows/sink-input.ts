import type { AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation";
import type { AutomationStudioRecordBatch } from "../../../../../engine/automation/contracts.ts";
import type { AutomationStudioAnswerFirstRowReader } from "./stored-rows-reader.ts";

export type AutomationStudioAnswerFirstRowSinkInput = {
  runId: string;
  /** Where a live read's answer holds its kept rows, as the bound domain declared it. */
  readRowsKey?: string | undefined;
  /** `AutomationStudioRunDatasets.recordBatchHandler(projectId, runId)`. */
  onRecordBatch: (batch: AutomationStudioRecordBatch) => Promise<AutomationStudioRunDatasetSummary>;
  /**
   * Stores a batch that starts its dataset over: it clears the dataset and takes on the batch's own schema and
   * processing, which the store otherwise fixes for the whole run (`AutomationStudioRunDatasets.restartedPass`, one
   * pass per batch). What a publication of the answer is written through (`./row-sink.ts`). Absent, `onRecordBatch`.
   */
  startOver?: ((batch: AutomationStudioRecordBatch) => Promise<AutomationStudioRunDatasetSummary>) | undefined;
  /**
   * Removes one of the run's datasets: a publication a later one superseded, so the run lists one result beside its
   * capture datasets (`AutomationStudioRunDatasets.deleteRunDatasets`, `./row-sink.ts`). Absent, nothing is retired.
   */
  retire?: ((datasetId: string) => Promise<unknown>) | undefined;
  /** Reads the stored rows back for `readBack`; absent, `readBack` answers from what the sink stored. */
  reader?: AutomationStudioAnswerFirstRowReader | undefined;
  /**
   * The person's request, in their own words. Where it names its columns, the result answers with
   * exactly those (`./row-sink.ts`, "The columns the person named"); absent, or naming none, nothing changes.
   */
  instructionText?: string | undefined;
};
