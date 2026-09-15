// Shapes the dataset endpoints put on the wire, as the browser reads them.
//
// These mirror `AutomationStudioRunDatasetSummary`, `AutomationStudioRunDatasetPage`
// and the export answers in `@fluxiq/contracts/record-sets`. They are restated
// here because no public `fluxiq` subpath re-exports them yet: browser code
// reaches `@fluxiq/contracts` only through a `fluxiq` subpath
// (`nodes/record-output.ts`), and that file lifts the record *schema* types only.
// The schema types below are therefore imported from the contract, not copied,
// because the table's columns depend on them. When a subpath re-exports the
// dataset types, delete these and import them instead.

import type { AutomationStudioRecordSchema } from "fluxiq/automation-studio/nodes";

export type RunDatasetExportFormat = "csv" | "json";

/** One dataset a run stored. Mirrors `AutomationStudioRunDatasetSummary`. */
export type RunDatasetSummary = {
  runId: string;
  datasetId: string;
  label?: string;
  nodeIds?: string[];
  schemaDigest?: string;
  recordCount: number;
  truncated?: boolean;
  invalidCount?: number;
  updatedAt?: number;
};

/**
 * One page of a dataset's rows. `schema` is the stored schema, so no excluded
 * field appears in it and the table can take its columns from it directly.
 */
export type RunDatasetPage = {
  summary?: RunDatasetSummary;
  schema: AutomationStudioRecordSchema;
  rows: Array<Record<string, unknown>>;
  nextCursor: string | null;
};

/** An export small enough to answer in one response. */
export type RunDatasetInlineExport = {
  tooLarge: false;
  format: RunDatasetExportFormat;
  fileName: string;
  contentType: string;
  body: string;
  rowCount: number;
  byteCount: number;
};

/** An export past the inline caps: the client downloads `downloadPath` instead. */
export type RunDatasetTooLargeExport = {
  tooLarge: true;
  format: RunDatasetExportFormat;
  rowCount: number;
  downloadPath: string;
};

export type RunDatasetExport = RunDatasetInlineExport | RunDatasetTooLargeExport;
