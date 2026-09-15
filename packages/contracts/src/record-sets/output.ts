import type { AutomationStudioRecordSchema } from "./schema.ts";

/** How a capture meets rows already stored for the same dataset in the same run. */
export const AUTOMATION_STUDIO_RECORD_WRITE_MODES = Object.freeze(["append", "replace"] as const);

export type AutomationStudioRecordWriteMode = (typeof AUTOMATION_STUDIO_RECORD_WRITE_MODES)[number];

/** Caps on a record output and on the rows it captures. */
export const AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS = Object.freeze({
  /** Letters, digits, `.`, `_`, `:`, and `-`, 1-200 characters; `.` and `..` are refused. */
  datasetIdPattern: /^[A-Za-z0-9._:-]{1,200}$/u,
  labelMaxLength: 200,
  /** Dot-separated segments of letters, digits, `_`, and `-`. */
  recordsPathMaxLength: 200,
  recordsPathMaxSegments: 8,
  /** Rows kept from one capture when `maxRecords` is not set. */
  maxRecordsDefault: 1_000,
  /** The highest `maxRecords` a record output may set. */
  maxRecordsCeiling: 10_000,
  /** UTF-8 bytes of a row's JSON. A larger row is invalid. */
  rowMaxBytes: 64 * 1024,
  /** Nesting depth of a `json` cell. A deeper value is invalid. */
  jsonCellMaxDepth: 32,
  /** Rows stored per dataset per run; later rows are dropped and the dataset is marked truncated. */
  maxRowsPerDatasetPerRun: 100_000
});

/**
 * Declares that a node's output carries rows to store as a dataset. Validate
 * any value that crossed a process or storage boundary with
 * `parseAutomationStudioRecordOutput`.
 */
export type AutomationStudioRecordOutput = {
  datasetId: string;
  label?: string;
  /** Dot-separated path to the row array inside the node's `result` output. Required: Core never assumes one. */
  recordsPath: string;
  schema: AutomationStudioRecordSchema;
  writeMode: AutomationStudioRecordWriteMode;
  /** Rows kept per capture, 1 to `maxRecordsCeiling`; `maxRecordsDefault` when absent. */
  maxRecords?: number;
};
