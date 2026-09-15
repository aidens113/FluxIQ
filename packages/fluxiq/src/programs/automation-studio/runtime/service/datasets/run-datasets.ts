import {
  AUTOMATION_STUDIO_RUN_DATASET_EXPORT_FORMATS,
  AUTOMATION_STUDIO_RUN_DATASET_EXPORT_LIMITS,
  type AutomationStudioDatasetRunSummaryPage,
  type AutomationStudioProjectDatasetSummaryPage,
  type AutomationStudioRunDatasetExportFormat,
  type AutomationStudioRunDatasetPage,
  type AutomationStudioRunDatasetSummary
} from "@fluxiq/contracts/automation-studio";
import {
  AutomationStudioProjectRunDatasetStore,
  type AutomationStudioProjectDatabasePool,
  type AutomationStudioRunDatasetAuditEventInput,
  type AutomationStudioRunDatasetAuditEventType,
  type AutomationStudioRunDatasetDeletion
} from "../../../storage/index.ts";
import type { AutomationStudioRecordBatch } from "../../executor/index.ts";
import type { AutomationStudioProjectStore } from "../projects/index.ts";
import { automationStudioRunDatasetExportBody } from "./export-body.ts";
import { automationStudioRunDatasetExportEncoder, type AutomationStudioRunDatasetExportEncoder } from "./export-encoder.ts";
import { automationStudioRecordSchemaDigest } from "./schema-digest.ts";
import type {
  AutomationStudioDatasetRunListRequest,
  AutomationStudioProjectDatasetListRequest,
  AutomationStudioRunDatasetDeleteRequest,
  AutomationStudioRunDatasetExport,
  AutomationStudioRunDatasetExportLimits,
  AutomationStudioRunDatasetExportRequest,
  AutomationStudioRunDatasetPageRequest,
  AutomationStudioRunDatasetStream,
  AutomationStudioRunDatasetTooLargeExport,
  AutomationStudioRunDatasetsRunRequest
} from "./types.ts";

const STORAGE_UNAVAILABLE = "Run datasets require project storage.";
const NOTHING_WRITTEN = Object.freeze({ rowCount: 0, byteCount: 0 });

/**
 * Run datasets for the Automation Studio service (CD16, CD17, CD20, CD21),
 * reached through the service's `runDatasets` field so the frozen facade gains
 * no members. Every call opens the project's run dataset store and closes it
 * before returning; a stream holds it until the stream settles. Endpoint
 * handlers check the permission and the project's domain before calling in.
 */
export class AutomationStudioRunDatasets {
  /** False without a project database pool. Every method then throws, and the service binds no record-batch hook. */
  readonly available: boolean;

  constructor(
    private readonly projects: AutomationStudioProjectStore,
    private readonly pool: AutomationStudioProjectDatabasePool | undefined,
    private readonly limits: AutomationStudioRunDatasetExportLimits = AUTOMATION_STUDIO_RUN_DATASET_EXPORT_LIMITS
  ) {
    this.available = pool !== undefined;
  }

  /**
   * The `onRecordBatch` hook for one run. Each batch opens the store, stores its
   * rows under its `batchKey` with the digest of its stored schema, and closes
   * the store. It throws, failing the attempt, when there is no pool, when the
   * store cannot be opened (CD16: there is no fallback), or when the store refuses
   * the batch.
   */
  recordBatchHandler(projectId: string, runId: string): (batch: AutomationStudioRecordBatch) => Promise<AutomationStudioRunDatasetSummary> {
    return async (batch) => {
      const store = await this.openStore(projectId);
      try {
        return await store.appendBatch({
          runId,
          datasetId: batch.datasetId,
          label: batch.label,
          nodeId: batch.nodeId,
          attemptId: batch.attemptId,
          batchKey: batch.batchKey,
          schema: batch.schema,
          schemaDigest: automationStudioRecordSchemaDigest(batch.schema),
          writeMode: batch.writeMode,
          rows: batch.rows,
          invalidCount: batch.invalidCount,
          truncated: batch.truncated
        });
      } finally {
        await store.close();
      }
    };
  }

  /** Every dataset the run stored, most recently written first. */
  listRunDatasets(input: AutomationStudioRunDatasetsRunRequest): Promise<AutomationStudioRunDatasetSummary[]> {
    return this.withProjectStore(input.projectId, (store) => store.listDatasets(input.runId));
  }

  /** One page of a dataset's rows (1-200, default 50), or null when the run stored no such dataset. */
  getRunDatasetPage(input: AutomationStudioRunDatasetPageRequest): Promise<AutomationStudioRunDatasetPage | null> {
    return this.withProjectStore(input.projectId, (store) => store.getPage({ runId: input.runId, datasetId: input.datasetId, limit: input.limit, cursor: input.cursor }));
  }

  /**
   * The dataset as one CSV or JSON body, or null when the run stored no such
   * dataset. Past `inlineMaxRows` rows or `inlineMaxBytes` bytes it answers
   * `tooLarge` with the streaming route's path. A body is returned only after its
   * `exported` event is written; a failure writes `export_failed` and throws.
   */
  async exportRunDataset(input: AutomationStudioRunDatasetExportRequest): Promise<AutomationStudioRunDatasetExport | null> {
    const format = requiredExportFormat(input.format);
    return this.withProjectStore(input.projectId, async (store) => {
      try {
        return await this.inlineExport(store, input, format);
      } catch (error) {
        await appendFailureAudit(store, auditEventInput("export_failed", input, format, NOTHING_WRITTEN));
        throw error;
      }
    });
  }

  /**
   * The dataset as a CSV or JSON stream, read in 500-row pages, or null when the
   * run stored no such dataset. The body ends on a whole row at `streamMaxRows`
   * or `streamMaxBytes`. One audit event is written when the stream settles:
   * `exported` when the body completes, `export_truncated` when a cap ended it,
   * and `export_failed` when reading fails or the consumer stops early.
   */
  async streamRunDataset(input: AutomationStudioRunDatasetExportRequest): Promise<AutomationStudioRunDatasetStream | null> {
    const format = requiredExportFormat(input.format);
    const found = await this.withProjectStore(input.projectId, (store) => store.getPage({ runId: input.runId, datasetId: input.datasetId, limit: 1 }));
    if (!found) return null;
    const encoder = automationStudioRunDatasetExportEncoder(found.schema, format);
    const chunks = this.streamChunks(input, encoder);
    return { format, fileName: exportFileName(input.runId, input.datasetId, format), contentType: encoder.contentType, [Symbol.asyncIterator]: () => chunks };
  }

  /** Deletes the run's datasets, or only `datasetId`, writing one `deleted` audit event per dataset (CD17). */
  deleteRunDatasets(input: AutomationStudioRunDatasetDeleteRequest): Promise<AutomationStudioRunDatasetDeletion> {
    return this.withProjectStore(input.projectId, (store) => store.deleteRunDatasets(input.runId, { datasetId: input.datasetId, actorId: input.actorId }));
  }

  /** The Data window's tables, newest write first, optionally for one Flow or matching `search` (K12). */
  listProjectDatasets(input: AutomationStudioProjectDatasetListRequest): Promise<AutomationStudioProjectDatasetSummaryPage> {
    return this.withProjectStore(input.projectId, (store) => store.listProjectDatasets({ flowId: input.flowId, search: input.search, limit: input.limit, cursor: input.cursor }));
  }

  /** The runs holding rows for one table, newest write first, with each run's status and start time (K12). */
  listDatasetRuns(input: AutomationStudioDatasetRunListRequest): Promise<AutomationStudioDatasetRunSummaryPage> {
    return this.withProjectStore(input.projectId, (store) =>
      store.listDatasetRuns({ flowId: input.flowId, datasetId: input.datasetId, status: input.status, runId: input.runId, limit: input.limit, cursor: input.cursor })
    );
  }

  private async inlineExport(store: AutomationStudioProjectRunDatasetStore, input: AutomationStudioRunDatasetExportRequest, format: AutomationStudioRunDatasetExportFormat): Promise<AutomationStudioRunDatasetExport | null> {
    const found = await store.getPage({ runId: input.runId, datasetId: input.datasetId, limit: 1 });
    if (!found) return null;
    if (found.summary.recordCount > this.limits.inlineMaxRows) return tooLargeExport(input, format, found.summary.recordCount);
    const encoder = automationStudioRunDatasetExportEncoder(found.schema, format);
    const chunks = automationStudioRunDatasetExportBody({ source: store, runId: input.runId, datasetId: input.datasetId, encoder, maxRows: this.limits.inlineMaxRows, maxBytes: this.limits.inlineMaxBytes });
    let body = "";
    let step = await chunks.next();
    while (!step.done) {
      body += step.value.text;
      step = await chunks.next();
    }
    const totals = step.value;
    if (totals.truncated) return tooLargeExport(input, format, found.summary.recordCount);
    await store.appendAuditEvent(auditEventInput("exported", input, format, totals));
    return { tooLarge: false, format, fileName: exportFileName(input.runId, input.datasetId, format), contentType: encoder.contentType, body, rowCount: totals.rowCount, byteCount: totals.byteCount };
  }

  private async *streamChunks(input: AutomationStudioRunDatasetExportRequest, encoder: AutomationStudioRunDatasetExportEncoder): AsyncGenerator<string, void, undefined> {
    const store = await this.openStore(input.projectId);
    let written: { rowCount: number; byteCount: number } = NOTHING_WRITTEN;
    let settled = false;
    try {
      const body = automationStudioRunDatasetExportBody({ source: store, runId: input.runId, datasetId: input.datasetId, encoder, maxRows: this.limits.streamMaxRows, maxBytes: this.limits.streamMaxBytes });
      let step = await body.next();
      while (!step.done) {
        written = step.value;
        yield step.value.text;
        step = await body.next();
      }
      await store.appendAuditEvent(auditEventInput(step.value.truncated ? "export_truncated" : "exported", input, encoder.format, step.value));
      settled = true;
    } catch (error) {
      settled = true;
      await appendFailureAudit(store, auditEventInput("export_failed", input, encoder.format, written));
      throw error;
    } finally {
      // Reached unsettled only when the consumer stopped early with `return()`.
      if (!settled) await appendFailureAudit(store, auditEventInput("export_failed", input, encoder.format, written));
      await store.close();
    }
  }

  private async withProjectStore<T>(projectId: string, operation: (store: AutomationStudioProjectRunDatasetStore) => Promise<T>): Promise<T> {
    if (!this.pool) throw new Error(STORAGE_UNAVAILABLE);
    await this.projects.findProjectSummary(projectId);
    const store = await this.openStore(projectId);
    try {
      return await operation(store);
    } finally {
      await store.close();
    }
  }

  private async openStore(projectId: string): Promise<AutomationStudioProjectRunDatasetStore> {
    if (!this.pool) throw new Error(STORAGE_UNAVAILABLE);
    return AutomationStudioProjectRunDatasetStore.open({ pool: this.pool, projectId });
  }
}

function requiredExportFormat(value: unknown): AutomationStudioRunDatasetExportFormat {
  const format = AUTOMATION_STUDIO_RUN_DATASET_EXPORT_FORMATS.find((candidate) => candidate === value);
  if (!format) throw new Error("Invalid run dataset export format.");
  return format;
}

function auditEventInput(
  eventType: AutomationStudioRunDatasetAuditEventType,
  request: AutomationStudioRunDatasetExportRequest,
  format: AutomationStudioRunDatasetExportFormat,
  written: { rowCount: number; byteCount: number }
): AutomationStudioRunDatasetAuditEventInput {
  return { eventType, runId: request.runId, datasetId: request.datasetId, actorId: request.actorId, format, rowCount: written.rowCount, byteCount: written.byteCount };
}

// Records a failure without replacing the error being thrown: if the audit
// write fails too, the export's own error still reaches the caller.
async function appendFailureAudit(store: AutomationStudioProjectRunDatasetStore, event: AutomationStudioRunDatasetAuditEventInput): Promise<void> {
  try {
    await store.appendAuditEvent(event);
  } catch {
    // The export's error is the one to report.
  }
}

function tooLargeExport(request: AutomationStudioRunDatasetExportRequest, format: AutomationStudioRunDatasetExportFormat, rowCount: number): AutomationStudioRunDatasetTooLargeExport {
  return { tooLarge: true, format, rowCount, downloadPath: runDatasetDownloadPath(request, format) };
}

// The streaming route's path. The web client appends `domainId`.
function runDatasetDownloadPath(request: AutomationStudioRunDatasetExportRequest, format: AutomationStudioRunDatasetExportFormat): string {
  return `/api/programs/automation-studio/run-datasets/${encodeURIComponent(request.projectId)}/${encodeURIComponent(request.runId)}/${encodeURIComponent(request.datasetId)}?format=${format}`;
}

// `fluxiq-dataset-<runId>-<datasetId>.<format>`, with every character outside
// [A-Za-z0-9._-] replaced, so it is safe inside a Content-Disposition header.
function exportFileName(runId: string, datasetId: string, format: AutomationStudioRunDatasetExportFormat): string {
  return `fluxiq-dataset-${runId}-${datasetId}.${format}`.replace(/[^A-Za-z0-9._-]/gu, "_");
}
