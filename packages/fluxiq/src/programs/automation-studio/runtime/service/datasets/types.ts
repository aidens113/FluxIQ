import type { AutomationStudioRunDatasetExportFormat } from "@fluxiq/contracts/automation-studio";

// Requests and answers of the run datasets collaborator. Endpoint handlers pass
// request fields through by name. `limit` and `cursor` stay `unknown` because
// the store clamps and validates them.

/** Caps on exporting one run dataset: `AUTOMATION_STUDIO_RUN_DATASET_EXPORT_LIMITS` unless a test narrows them. */
export type AutomationStudioRunDatasetExportLimits = {
  readonly inlineMaxRows: number;
  readonly inlineMaxBytes: number;
  readonly streamMaxRows: number;
  readonly streamMaxBytes: number;
};

export type AutomationStudioRunDatasetsRunRequest = { projectId: string; runId: string };

export type AutomationStudioRunDatasetPageRequest = { projectId: string; runId: string; datasetId: string; limit?: unknown; cursor?: unknown };

/** `actorId` is the signed-in user the audit event names. */
export type AutomationStudioRunDatasetExportRequest = { projectId: string; runId: string; datasetId: string; format: AutomationStudioRunDatasetExportFormat; actorId?: string | undefined };

/** Without `datasetId`, every dataset the run stored is deleted. */
export type AutomationStudioRunDatasetDeleteRequest = { projectId: string; runId: string; datasetId?: string | undefined; actorId?: string | undefined };

export type AutomationStudioProjectDatasetListRequest = { projectId: string; flowId?: string | undefined; search?: string | undefined; limit?: unknown; cursor?: unknown };

export type AutomationStudioDatasetRunListRequest = { projectId: string; flowId: string; datasetId: string; status?: string | undefined; runId?: string | undefined; limit?: unknown; cursor?: unknown };

/** An export small enough to answer in one response. Its `exported` audit event was written before it was returned. */
export type AutomationStudioRunDatasetInlineExport = {
  tooLarge: false;
  format: AutomationStudioRunDatasetExportFormat;
  fileName: string;
  contentType: string;
  body: string;
  rowCount: number;
  byteCount: number;
};

/**
 * An export past the inline caps. The client downloads `downloadPath`, the
 * streaming route, instead, appending its `domainId` as for any program request.
 * `rowCount` is the dataset's stored row count. No audit event is written, since
 * no row left the store.
 */
export type AutomationStudioRunDatasetTooLargeExport = {
  tooLarge: true;
  format: AutomationStudioRunDatasetExportFormat;
  rowCount: number;
  downloadPath: string;
};

export type AutomationStudioRunDatasetExport = AutomationStudioRunDatasetInlineExport | AutomationStudioRunDatasetTooLargeExport;

/**
 * A single-use export body for the streaming route, with the response headers'
 * values. `fileName` holds only `[A-Za-z0-9._-]`. Nothing is opened until the
 * first chunk is requested. A route must call `return()` on the iterator when the
 * client goes away: that releases the store and writes the `export_failed` event.
 */
export type AutomationStudioRunDatasetStream = AsyncIterable<string> & {
  format: AutomationStudioRunDatasetExportFormat;
  fileName: string;
  contentType: string;
};
