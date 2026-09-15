import type { JsonObject } from "../core.ts";
import type { AutomationStudioRecordSchema } from "./schema.ts";

/** Formats a run dataset can be exported as. */
export const AUTOMATION_STUDIO_RUN_DATASET_EXPORT_FORMATS = Object.freeze(["csv", "json"] as const);

export type AutomationStudioRunDatasetExportFormat = (typeof AUTOMATION_STUDIO_RUN_DATASET_EXPORT_FORMATS)[number];

/** Caps on exporting a run dataset. */
export const AUTOMATION_STUDIO_RUN_DATASET_EXPORT_LIMITS = Object.freeze({
  /** Above either inline cap the export answers `tooLarge` with a streaming link instead. */
  inlineMaxRows: 10_000,
  inlineMaxBytes: 5 * 1024 * 1024,
  /** A stream that reaches either cap ends and records `export_truncated`. */
  streamMaxRows: 100_000,
  streamMaxBytes: 256 * 1024 * 1024
});

/** One dataset stored by one run. */
export type AutomationStudioRunDatasetSummary = {
  runId: string;
  datasetId: string;
  label?: string;
  /** Nodes that wrote rows to this dataset during the run. */
  nodeIds: string[];
  /** Digest of the stored schema (`storedAutomationStudioRecordSchema`). */
  schemaDigest: string;
  recordCount: number;
  /** True when rows past `maxRowsPerDatasetPerRun` were dropped. */
  truncated: boolean;
  /** Rows refused by `validateAutomationStudioRecords`. */
  invalidCount: number;
  /** Epoch milliseconds. */
  updatedAt: number;
};

/** One page of a run dataset's rows. `schema` is the stored schema, so no `exclude` field appears. */
export type AutomationStudioRunDatasetPage = {
  summary: AutomationStudioRunDatasetSummary;
  schema: AutomationStudioRecordSchema;
  rows: JsonObject[];
  nextCursor: string | null;
};
