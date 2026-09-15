import { randomUUID } from "node:crypto";
import {
  AUTOMATION_STUDIO_DATASET_RUN_STATUSES,
  AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS,
  AUTOMATION_STUDIO_RECORD_WRITE_MODES,
  AUTOMATION_STUDIO_RUN_DATASET_EXPORT_FORMATS,
  parseAutomationStudioRecordSchema,
  storedAutomationStudioRecordSchema,
  type AutomationStudioDatasetRunStatus,
  type AutomationStudioDatasetRunSummary,
  type AutomationStudioDatasetRunSummaryPage,
  type AutomationStudioProjectDatasetSummary,
  type AutomationStudioProjectDatasetSummaryPage,
  type AutomationStudioRecordSchema,
  type AutomationStudioRecordWriteMode,
  type AutomationStudioRunDatasetExportFormat,
  type AutomationStudioRunDatasetPage,
  type AutomationStudioRunDatasetSummary
} from "@fluxiq/contracts/automation-studio";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "./administration.ts";
import type { AutomationStudioProjectDatabaseLease, AutomationStudioProjectDatabasePool, AutomationStudioSqlExecutor } from "./database.ts";
import { automationStudioFilterHash, automationStudioPageLimit, decodeAutomationStudioPageCursor, encodeAutomationStudioPageCursor } from "../paging.ts";
import { AutomationStudioSchemaMigrationRunner } from "../schema-migrations.ts";

/** One stored row: a JSON object keyed by the stored schema's field ids. */
export type AutomationStudioRunDatasetRow = AutomationStudioRunDatasetPage["rows"][number];

export type AutomationStudioRunDatasetAuditEventType = "exported" | "export_truncated" | "export_failed" | "deleted";

/** A typed audit event. It carries ids and counts only, so no row value can reach it. */
export type AutomationStudioRunDatasetAuditEvent = {
  eventId: string;
  eventType: AutomationStudioRunDatasetAuditEventType;
  runId: string;
  datasetId?: string;
  actorId?: string;
  format?: AutomationStudioRunDatasetExportFormat;
  rowCount: number;
  byteCount: number;
  createdAt: number;
};

export type AutomationStudioRunDatasetAuditEventInput = {
  eventType: AutomationStudioRunDatasetAuditEventType;
  runId: string;
  datasetId?: string | undefined;
  actorId?: string | undefined;
  format?: AutomationStudioRunDatasetExportFormat | undefined;
  rowCount?: number | undefined;
  byteCount?: number | undefined;
  now?: number | undefined;
};

/** One capture's rows for one dataset, already validated against `schema` by the caller. */
export type AutomationStudioRunDatasetBatch = {
  runId: string;
  datasetId: string;
  label?: string | undefined;
  nodeId: string;
  /** Kept with the rows for reference. It repeats across Call Flow children, so it never identifies a batch. */
  attemptId: string;
  /**
   * Identifies the batch within the run: the executor's nested Call Flow attempt
   * path joined with the attempt id (`AutomationStudioRecordBatch.batchKey`). A
   * batch with a key already stored for this dataset replaces that batch.
   */
  batchKey: string;
  schema: AutomationStudioRecordSchema;
  schemaDigest: string;
  writeMode: AutomationStudioRecordWriteMode;
  rows: readonly AutomationStudioRunDatasetRow[];
  invalidCount: number;
  truncated: boolean;
  now?: number | undefined;
};

/** Rows read for streaming, with the ordinal to continue after. */
export type AutomationStudioRunDatasetRowBatch = { rows: AutomationStudioRunDatasetRow[]; lastOrdinal: number; hasMore: boolean };

export type AutomationStudioRunDatasetDeletion = { datasetCount: number; rowCount: number };

const MAX_ROWS_PER_DATASET = AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.maxRowsPerDatasetPerRun;
const STREAM_READ_LIMIT = 500;
const AUDIT_LIST_LIMIT = 500;
const ROW_INSERT_CHUNK = 200;
const SEARCH_MAX_LENGTH = 200;
const NODE_KEY_MAX_LENGTH = 1_000;
const BATCH_KEY_MAX_LENGTH = 4_000;
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/u;
const DIGEST_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/u;
const AUDIT_EVENT_TYPES: readonly AutomationStudioRunDatasetAuditEventType[] = ["exported", "export_truncated", "export_failed", "deleted"];
const SUMMARY_COLUMN_NAMES = ["run_id", "dataset_id", "flow_id", "label", "schema_digest", "node_ids_json", "record_count", "invalid_count", "truncated", "updated_at_ms"] as const;
const SUMMARY_COLUMNS = SUMMARY_COLUMN_NAMES.join(", ");
const DATASET_RUN_COLUMNS = SUMMARY_COLUMN_NAMES.map((name) => `d.${name}`).join(", ");
const CATALOG_LATEST_COLUMNS = ["label", "latest_run_id", "latest_updated_at_ms", "latest_record_count", "latest_truncated", "schema_digest"] as const;
// latest_* follow the run written most recently: a later updated_at_ms wins, and on a tie the smaller
// run_id, which is the row `order by updated_at_ms desc, run_id` puts first in recomputeCatalog and
// listDatasetRuns. SQLite evaluates every assignment against the row as it was before the update.
const CATALOG_NEWER = "(excluded.latest_run_id = run_dataset_catalog.latest_run_id or excluded.latest_updated_at_ms > run_dataset_catalog.latest_updated_at_ms or (excluded.latest_updated_at_ms = run_dataset_catalog.latest_updated_at_ms and excluded.latest_run_id < run_dataset_catalog.latest_run_id))";
const CATALOG_UPSERT_LATEST = CATALOG_LATEST_COLUMNS.map((column) => `${column} = case when ${CATALOG_NEWER} then excluded.${column} else run_dataset_catalog.${column} end`).join(", ");

type RunDatasetSummaryRow = { run_id: string; dataset_id: string; flow_id: string; label: string | null; schema_digest: string; node_ids_json: string; record_count: number; invalid_count: number; truncated: number; updated_at_ms: number };
type DatasetRunRow = RunDatasetSummaryRow & { run_status: string; run_started_at_ms: number | null };
type CatalogRow = { flow_id: string; dataset_id: string; label: string | null; latest_run_id: string; latest_updated_at_ms: number; run_count: number; latest_record_count: number; latest_truncated: number; schema_digest: string };
type AuditRow = { event_id: string; event_type: AutomationStudioRunDatasetAuditEventType; run_id: string; dataset_id: string | null; actor_id: string | null; format: AutomationStudioRunDatasetExportFormat | null; row_count: number; byte_count: number; created_at_ms: number };
type BatchCountsRow = { row_count: number; invalid_count: number; truncated: number };
type StoredRow = { ordinal: number; row_json: string };

/**
 * The rows runs capture per dataset, stored raw in `project.sqlite` (CD16) and
 * kept as long as the project unless deleted (CD17), with the project catalog
 * of tables per Flow (CD21) and typed audit events (CD20).
 */
export class AutomationStudioProjectRunDatasetStore {
  private constructor(private readonly lease: AutomationStudioProjectDatabaseLease) {}

  /** Opens the project database and brings its schema up to date; throws when the store cannot be opened. */
  static async open(input: { pool: AutomationStudioProjectDatabasePool; projectId: string }): Promise<AutomationStudioProjectRunDatasetStore> {
    const lease = await input.pool.acquire(input.projectId);
    try {
      await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS }).migrate();
      return new AutomationStudioProjectRunDatasetStore(lease);
    } catch (error) {
      await lease.release();
      throw error;
    }
  }

  close(): Promise<void> {
    return this.lease.release();
  }

  /**
   * Stores one capture's rows in one transaction, updates the table's catalog
   * entry, and returns the dataset's summary. `replace` clears the dataset's
   * rows and batches first. `append` continues after the highest ordinal; a
   * batch whose `batchKey` is already stored for this dataset replaces that
   * batch, removing its rows and subtracting its row and invalid counts, so a
   * retry is counted once. Rows past `maxRowsPerDatasetPerRun` are dropped and
   * mark the batch and the dataset truncated. Throws, writing nothing, when the
   * schema digest differs from the one stored for this run, when a row holds a
   * key outside the stored schema, or when the run has no `runtime_runs` row.
   */
  async appendBatch(input: AutomationStudioRunDatasetBatch): Promise<AutomationStudioRunDatasetSummary> {
    const runId = requiredId(input.runId, "run");
    const datasetId = requiredDatasetId(input.datasetId);
    const nodeId = requiredText(input.nodeId, "node ID", NODE_KEY_MAX_LENGTH);
    const attemptId = requiredText(input.attemptId, "attempt ID", NODE_KEY_MAX_LENGTH);
    const batchKey = requiredText(input.batchKey, "batch key", BATCH_KEY_MAX_LENGTH);
    const label = optionalLabel(input.label);
    const schema = storedSchema(input.schema);
    const schemaDigest = requiredDigest(input.schemaDigest);
    const writeMode = requiredWriteMode(input.writeMode);
    const invalidCount = nonNegativeInteger(input.invalidCount, "Run dataset invalid count");
    if (typeof input.truncated !== "boolean") throw new Error("Run dataset truncated flag must be a boolean.");
    const now = nonNegativeInteger(input.now ?? Date.now(), "Run dataset timestamp");
    const rows = serializedRows(input.rows, schema);
    return this.lease.database.transaction(async (sql) => {
      const existing = await sql.get<RunDatasetSummaryRow>(`select ${SUMMARY_COLUMNS} from run_datasets where run_id = ? and dataset_id = ?`, [runId, datasetId]);
      if (existing && existing.schema_digest !== schemaDigest) throw new Error("Run dataset schema changed within one run.");
      if (!existing) {
        // flow_id is the run's Flow. For an unknown run it would be null, but the run_id guard aborts first.
        await sql.run(
          `insert into run_datasets (run_id, dataset_id, flow_id, label, schema_json, schema_digest, node_ids_json, record_count, invalid_count, truncated, created_at_ms, updated_at_ms)
           values (?, ?, (select flow_id from runtime_runs where run_id = ?), ?, ?, ?, '[]', 0, 0, 0, ?, ?)`,
          [runId, datasetId, runId, label, JSON.stringify(schema), schemaDigest, now, now]
        );
      }
      let recordCount = existing?.record_count ?? 0;
      let invalidTotal = existing?.invalid_count ?? 0;
      let truncated = existing?.truncated === 1;
      let recomputeTruncated = false;
      if (writeMode === "replace") {
        await sql.run("delete from run_dataset_rows where run_id = ? and dataset_id = ?", [runId, datasetId]);
        await sql.run("delete from run_dataset_batches where run_id = ? and dataset_id = ?", [runId, datasetId]);
        recordCount = 0;
        invalidTotal = 0;
        truncated = false;
      } else {
        // A batch key already stored is a retry: the earlier batch's rows and counts leave before the new ones arrive.
        const previous = await sql.get<BatchCountsRow>("select row_count, invalid_count, truncated from run_dataset_batches where run_id = ? and dataset_id = ? and batch_key = ?", [runId, datasetId, batchKey]);
        if (previous) {
          await sql.run("delete from run_dataset_rows where run_id = ? and dataset_id = ? and batch_key = ?", [runId, datasetId, batchKey]);
          recordCount = Math.max(0, recordCount - previous.row_count);
          invalidTotal = Math.max(0, invalidTotal - previous.invalid_count);
          recomputeTruncated = previous.truncated === 1;
        }
      }
      const highest = await sql.get<{ ordinal: number | null }>("select max(ordinal) as ordinal from run_dataset_rows where run_id = ? and dataset_id = ?", [runId, datasetId]);
      const room = Math.max(0, MAX_ROWS_PER_DATASET - recordCount);
      const kept = rows.length > room ? rows.slice(0, room) : rows;
      const batchTruncated = input.truncated || rows.length > room;
      await insertRows(sql, { runId, datasetId, attemptId, batchKey, firstOrdinal: (highest?.ordinal ?? 0) + 1, rows: kept });
      await sql.run(
        `insert into run_dataset_batches (run_id, dataset_id, batch_key, attempt_id, node_id, row_count, invalid_count, truncated, created_at_ms, updated_at_ms)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         on conflict(run_id, dataset_id, batch_key) do update set attempt_id = excluded.attempt_id, node_id = excluded.node_id, row_count = excluded.row_count,
           invalid_count = excluded.invalid_count, truncated = excluded.truncated, updated_at_ms = excluded.updated_at_ms`,
        [runId, datasetId, batchKey, attemptId, nodeId, kept.length, invalidCount, batchTruncated ? 1 : 0, now, now]
      );
      recordCount += kept.length;
      invalidTotal += invalidCount;
      if (recomputeTruncated) {
        // The replaced batch was the one that marked the dataset truncated, or one of several; ask the batches.
        const flagged = await sql.get<{ truncated: number }>("select exists(select 1 from run_dataset_batches where run_id = ? and dataset_id = ? and truncated = 1) as truncated", [runId, datasetId]);
        truncated = flagged?.truncated === 1;
      } else {
        truncated = truncated || batchTruncated;
      }
      await sql.run(
        "update run_datasets set label = coalesce(?, label), node_ids_json = ?, record_count = ?, invalid_count = ?, truncated = ?, updated_at_ms = max(updated_at_ms, ?) where run_id = ? and dataset_id = ?",
        [label, JSON.stringify(withNodeId(existing?.node_ids_json, nodeId)), recordCount, invalidTotal, truncated ? 1 : 0, now, runId, datasetId]
      );
      const saved = await sql.get<RunDatasetSummaryRow>(`select ${SUMMARY_COLUMNS} from run_datasets where run_id = ? and dataset_id = ?`, [runId, datasetId]);
      if (!saved) throw new Error(`Run dataset ${datasetId} was not persisted.`);
      await upsertCatalog(sql, saved, existing ? 0 : 1);
      return summaryFromRow(saved);
    });
  }

  /** Every dataset the run stored, most recently written first. */
  listDatasets(runId: string): Promise<AutomationStudioRunDatasetSummary[]> {
    return runDatasetSummariesForRun(this.lease.database, runId);
  }

  /** One page of a dataset's rows in ordinal order, or null when the run stored no such dataset. */
  async getPage(input: { runId: string; datasetId: string; limit?: unknown; cursor?: unknown }): Promise<AutomationStudioRunDatasetPage | null> {
    const runId = requiredId(input.runId, "run");
    const datasetId = requiredDatasetId(input.datasetId);
    const limit = automationStudioPageLimit(input.limit);
    const owner = `run-dataset:${runId}:${datasetId}`;
    const filterHash = automationStudioFilterHash({});
    const cursor = decodeAutomationStudioPageCursor<{ ordinal: number }>(input.cursor, { owner, filterHash, validate: (values) => isOrdinal(values.ordinal) });
    return this.lease.database.execute(async (sql): Promise<AutomationStudioRunDatasetPage | null> => {
      const dataset = await sql.get<RunDatasetSummaryRow & { schema_json: string }>(`select ${SUMMARY_COLUMNS}, schema_json from run_datasets where run_id = ? and dataset_id = ?`, [runId, datasetId]);
      if (!dataset) return null;
      const stored = await sql.all<StoredRow>("select ordinal, row_json from run_dataset_rows where run_id = ? and dataset_id = ? and ordinal > ? order by ordinal limit ?", [runId, datasetId, cursor?.ordinal ?? 0, limit + 1]);
      const pageRows = stored.slice(0, limit);
      const last = pageRows.at(-1);
      return {
        summary: summaryFromRow(dataset),
        schema: JSON.parse(dataset.schema_json) as AutomationStudioRecordSchema,
        rows: pageRows.map(rowFromStored),
        nextCursor: stored.length > limit && last ? encodeAutomationStudioPageCursor({ owner, filterHash, values: { ordinal: last.ordinal } }) : null
      };
    });
  }

  /** Up to 500 rows after `afterOrdinal`, in ordinal order, for streaming an export. */
  async readRows(input: { runId: string; datasetId: string; afterOrdinal?: unknown; limit?: unknown }): Promise<AutomationStudioRunDatasetRowBatch> {
    const runId = requiredId(input.runId, "run");
    const datasetId = requiredDatasetId(input.datasetId);
    const afterOrdinal = clampInteger(input.afterOrdinal, 0, Number.MAX_SAFE_INTEGER, 0);
    const limit = clampInteger(input.limit, 1, STREAM_READ_LIMIT, STREAM_READ_LIMIT);
    const stored = await this.lease.database.all<StoredRow>("select ordinal, row_json from run_dataset_rows where run_id = ? and dataset_id = ? and ordinal > ? order by ordinal limit ?", [runId, datasetId, afterOrdinal, limit + 1]);
    const batch = stored.slice(0, limit);
    return { rows: batch.map(rowFromStored), lastOrdinal: batch.at(-1)?.ordinal ?? afterOrdinal, hasMore: stored.length > limit };
  }

  /** Writes one typed audit event: an export's outcome, or a deletion. */
  async appendAuditEvent(input: AutomationStudioRunDatasetAuditEventInput): Promise<AutomationStudioRunDatasetAuditEvent> {
    const event = auditEvent(input);
    await insertAuditEvent(this.lease.database, event);
    return event;
  }

  /** A run's audit events, oldest first, optionally for one dataset. */
  async listAuditEvents(input: { runId: string; datasetId?: string | undefined; limit?: unknown }): Promise<AutomationStudioRunDatasetAuditEvent[]> {
    const clauses = ["run_id = ?"];
    const params: unknown[] = [requiredId(input.runId, "run")];
    if (input.datasetId !== undefined) {
      clauses.push("dataset_id = ?");
      params.push(requiredDatasetId(input.datasetId));
    }
    const rows = await this.lease.database.all<AuditRow>(`select * from run_dataset_audit_events where ${clauses.join(" and ")} order by created_at_ms, event_id limit ?`, [...params, clampInteger(input.limit, 1, AUDIT_LIST_LIMIT, 100)]);
    return rows.map(auditEventFromRow);
  }

  /**
   * Deletes a run's datasets, or only `datasetId`, with their rows and batches,
   * in one transaction. Writes a `deleted` audit event per dataset, keeps every
   * audit event, and recomputes the catalog entry of each affected table,
   * removing it when no run holds rows for that table any more.
   */
  async deleteRunDatasets(runId: string, options: { datasetId?: string | undefined; actorId?: string | undefined; now?: number | undefined } = {}): Promise<AutomationStudioRunDatasetDeletion> {
    const run = requiredId(runId, "run");
    const datasetId = options.datasetId === undefined ? null : requiredDatasetId(options.datasetId);
    const actorId = options.actorId === undefined ? undefined : requiredId(options.actorId, "actor");
    const now = nonNegativeInteger(options.now ?? Date.now(), "Run dataset timestamp");
    return this.lease.database.transaction(async (sql) => {
      const targets = datasetId === null
        ? await sql.all<{ dataset_id: string; flow_id: string }>("select dataset_id, flow_id from run_datasets where run_id = ? order by dataset_id", [run])
        : await sql.all<{ dataset_id: string; flow_id: string }>("select dataset_id, flow_id from run_datasets where run_id = ? and dataset_id = ?", [run, datasetId]);
      let rowCount = 0;
      for (const target of targets) {
        const removed = await sql.run("delete from run_dataset_rows where run_id = ? and dataset_id = ?", [run, target.dataset_id]);
        await sql.run("delete from run_dataset_batches where run_id = ? and dataset_id = ?", [run, target.dataset_id]);
        await sql.run("delete from run_datasets where run_id = ? and dataset_id = ?", [run, target.dataset_id]);
        await insertAuditEvent(sql, auditEvent({ eventType: "deleted", runId: run, datasetId: target.dataset_id, actorId, rowCount: removed.changes, now }));
        await recomputeCatalog(sql, target.flow_id, target.dataset_id);
        rowCount += removed.changes;
      }
      return { datasetCount: targets.length, rowCount };
    });
  }

  /** The project's tables, newest write first, optionally for one Flow and matching `search` in the dataset id or label. */
  async listProjectDatasets(input: { flowId?: string | undefined; search?: string | undefined; limit?: unknown; cursor?: unknown } = {}): Promise<AutomationStudioProjectDatasetSummaryPage> {
    const flowId = input.flowId === undefined ? null : requiredId(input.flowId, "flow");
    const search = optionalSearch(input.search);
    const limit = automationStudioPageLimit(input.limit);
    const owner = "project-datasets";
    const filterHash = automationStudioFilterHash({ flowId, search });
    const cursor = decodeAutomationStudioPageCursor<{ updatedAt: number; flowId: string; datasetId: string }>(input.cursor, {
      owner,
      filterHash,
      validate: (values) => Number.isSafeInteger(values.updatedAt) && typeof values.flowId === "string" && typeof values.datasetId === "string"
    });
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (flowId !== null) {
      clauses.push("flow_id = ?");
      params.push(flowId);
    }
    if (search !== null) {
      clauses.push("(instr(lower(dataset_id), ?) > 0 or instr(lower(coalesce(label, '')), ?) > 0)");
      params.push(search, search);
    }
    if (cursor) {
      clauses.push("(latest_updated_at_ms < ? or (latest_updated_at_ms = ? and (flow_id > ? or (flow_id = ? and dataset_id > ?))))");
      params.push(cursor.updatedAt, cursor.updatedAt, cursor.flowId, cursor.flowId, cursor.datasetId);
    }
    const rows = await this.lease.database.all<CatalogRow>(
      `select * from run_dataset_catalog${clauses.length ? ` where ${clauses.join(" and ")}` : ""} order by latest_updated_at_ms desc, flow_id, dataset_id limit ?`,
      [...params, limit + 1]
    );
    const pageRows = rows.slice(0, limit);
    const last = pageRows.at(-1);
    return {
      datasets: pageRows.map(projectDatasetFromRow),
      nextCursor: rows.length > limit && last ? encodeAutomationStudioPageCursor({ owner, filterHash, values: { updatedAt: last.latest_updated_at_ms, flowId: last.flow_id, datasetId: last.dataset_id } }) : null
    };
  }

  /** The runs holding rows for one table, newest write first, joined to each run's status and start time. */
  async listDatasetRuns(input: { flowId: string; datasetId: string; status?: string | undefined; runId?: string | undefined; limit?: unknown; cursor?: unknown }): Promise<AutomationStudioDatasetRunSummaryPage> {
    const flowId = requiredId(input.flowId, "flow");
    const datasetId = requiredDatasetId(input.datasetId);
    const status = input.status === undefined ? null : requiredRunStatus(input.status);
    const runId = input.runId === undefined ? null : requiredId(input.runId, "run");
    const limit = automationStudioPageLimit(input.limit);
    const owner = `dataset-runs:${flowId}:${datasetId}`;
    const filterHash = automationStudioFilterHash({ status, runId });
    const cursor = decodeAutomationStudioPageCursor<{ updatedAt: number; runId: string }>(input.cursor, {
      owner,
      filterHash,
      validate: (values) => Number.isSafeInteger(values.updatedAt) && typeof values.runId === "string"
    });
    const clauses = ["d.flow_id = ?", "d.dataset_id = ?"];
    const params: unknown[] = [flowId, datasetId];
    if (status !== null) {
      clauses.push("r.status = ?");
      params.push(status);
    }
    if (runId !== null) {
      clauses.push("d.run_id = ?");
      params.push(runId);
    }
    if (cursor) {
      clauses.push("(d.updated_at_ms < ? or (d.updated_at_ms = ? and d.run_id > ?))");
      params.push(cursor.updatedAt, cursor.updatedAt, cursor.runId);
    }
    const rows = await this.lease.database.all<DatasetRunRow>(
      `select ${DATASET_RUN_COLUMNS}, r.status as run_status, r.started_at_ms as run_started_at_ms
       from run_datasets d join runtime_runs r on r.run_id = d.run_id
       where ${clauses.join(" and ")} order by d.updated_at_ms desc, d.run_id limit ?`,
      [...params, limit + 1]
    );
    const pageRows = rows.slice(0, limit);
    const last = pageRows.at(-1);
    return {
      runs: pageRows.map(datasetRunFromRow),
      nextCursor: rows.length > limit && last ? encodeAutomationStudioPageCursor({ owner, filterHash, values: { updatedAt: last.updated_at_ms, runId: last.run_id } }) : null
    };
  }
}

/** A run's dataset summaries, most recently written first. */
export async function runDatasetSummariesForRun(sql: AutomationStudioSqlExecutor, runId: string): Promise<AutomationStudioRunDatasetSummary[]> {
  const rows = await sql.all<RunDatasetSummaryRow>(`select ${SUMMARY_COLUMNS} from run_datasets where run_id = ? order by updated_at_ms desc, dataset_id`, [requiredId(runId, "run")]);
  return rows.map(summaryFromRow);
}

async function insertRows(sql: AutomationStudioSqlExecutor, input: { runId: string; datasetId: string; attemptId: string; batchKey: string; firstOrdinal: number; rows: readonly string[] }): Promise<void> {
  for (let offset = 0; offset < input.rows.length; offset += ROW_INSERT_CHUNK) {
    const chunk = input.rows.slice(offset, offset + ROW_INSERT_CHUNK);
    const params: unknown[] = [];
    chunk.forEach((rowJson, index) => params.push(input.runId, input.datasetId, input.firstOrdinal + offset + index, input.attemptId, input.batchKey, rowJson));
    await sql.run(`insert into run_dataset_rows (run_id, dataset_id, ordinal, attempt_id, batch_key, row_json) values ${chunk.map(() => "(?, ?, ?, ?, ?, ?)").join(", ")}`, params);
  }
}

async function upsertCatalog(sql: AutomationStudioSqlExecutor, dataset: RunDatasetSummaryRow, newRuns: 0 | 1): Promise<void> {
  await sql.run(
    `insert into run_dataset_catalog (flow_id, dataset_id, label, latest_run_id, latest_updated_at_ms, run_count, latest_record_count, latest_truncated, schema_digest)
     values (?, ?, ?, ?, ?, 1, ?, ?, ?)
     on conflict(flow_id, dataset_id) do update set run_count = run_dataset_catalog.run_count + ?, ${CATALOG_UPSERT_LATEST}`,
    [dataset.flow_id, dataset.dataset_id, dataset.label, dataset.run_id, dataset.updated_at_ms, dataset.record_count, dataset.truncated, dataset.schema_digest, newRuns]
  );
}

async function recomputeCatalog(sql: AutomationStudioSqlExecutor, flowId: string, datasetId: string): Promise<void> {
  const counted = await sql.get<{ total: number }>("select count(*) as total from run_datasets where flow_id = ? and dataset_id = ?", [flowId, datasetId]);
  const newest = await sql.get<RunDatasetSummaryRow>(`select ${SUMMARY_COLUMNS} from run_datasets where flow_id = ? and dataset_id = ? order by updated_at_ms desc, run_id limit 1`, [flowId, datasetId]);
  if (!newest || !counted?.total) {
    await sql.run("delete from run_dataset_catalog where flow_id = ? and dataset_id = ?", [flowId, datasetId]);
    return;
  }
  await sql.run(
    `insert into run_dataset_catalog (flow_id, dataset_id, label, latest_run_id, latest_updated_at_ms, run_count, latest_record_count, latest_truncated, schema_digest)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict(flow_id, dataset_id) do update set label = excluded.label, latest_run_id = excluded.latest_run_id, latest_updated_at_ms = excluded.latest_updated_at_ms,
       run_count = excluded.run_count, latest_record_count = excluded.latest_record_count, latest_truncated = excluded.latest_truncated, schema_digest = excluded.schema_digest`,
    [flowId, datasetId, newest.label, newest.run_id, newest.updated_at_ms, counted.total, newest.record_count, newest.truncated, newest.schema_digest]
  );
}

async function insertAuditEvent(sql: AutomationStudioSqlExecutor, event: AutomationStudioRunDatasetAuditEvent): Promise<void> {
  await sql.run(
    "insert into run_dataset_audit_events (event_id, event_type, run_id, dataset_id, actor_id, format, row_count, byte_count, created_at_ms) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [event.eventId, event.eventType, event.runId, event.datasetId ?? null, event.actorId ?? null, event.format ?? null, event.rowCount, event.byteCount, event.createdAt]
  );
}

function auditEvent(input: AutomationStudioRunDatasetAuditEventInput): AutomationStudioRunDatasetAuditEvent {
  if (!AUDIT_EVENT_TYPES.includes(input.eventType)) throw new Error("Invalid run dataset audit event type.");
  const event: AutomationStudioRunDatasetAuditEvent = {
    eventId: `run-dataset-audit:${randomUUID()}`,
    eventType: input.eventType,
    runId: requiredId(input.runId, "run"),
    rowCount: nonNegativeInteger(input.rowCount ?? 0, "Run dataset audit row count"),
    byteCount: nonNegativeInteger(input.byteCount ?? 0, "Run dataset audit byte count"),
    createdAt: nonNegativeInteger(input.now ?? Date.now(), "Run dataset audit timestamp")
  };
  if (input.datasetId !== undefined) event.datasetId = requiredDatasetId(input.datasetId);
  if (input.actorId !== undefined) event.actorId = requiredId(input.actorId, "actor");
  if (input.format !== undefined) event.format = requiredExportFormat(input.format);
  return event;
}

function auditEventFromRow(row: AuditRow): AutomationStudioRunDatasetAuditEvent {
  const event: AutomationStudioRunDatasetAuditEvent = { eventId: row.event_id, eventType: row.event_type, runId: row.run_id, rowCount: row.row_count, byteCount: row.byte_count, createdAt: row.created_at_ms };
  if (row.dataset_id !== null) event.datasetId = row.dataset_id;
  if (row.actor_id !== null) event.actorId = row.actor_id;
  if (row.format !== null) event.format = row.format;
  return event;
}

function summaryFromRow(row: RunDatasetSummaryRow): AutomationStudioRunDatasetSummary {
  const summary: AutomationStudioRunDatasetSummary = {
    runId: row.run_id,
    datasetId: row.dataset_id,
    nodeIds: nodeIdsFromJson(row.node_ids_json),
    schemaDigest: row.schema_digest,
    recordCount: row.record_count,
    truncated: row.truncated === 1,
    invalidCount: row.invalid_count,
    updatedAt: row.updated_at_ms
  };
  if (row.label !== null) summary.label = row.label;
  return summary;
}

function datasetRunFromRow(row: DatasetRunRow): AutomationStudioDatasetRunSummary {
  const summary = summaryFromRow(row);
  return { ...summary, flowId: row.flow_id, runStatus: requiredRunStatus(row.run_status), runStartedAt: row.run_started_at_ms };
}

function projectDatasetFromRow(row: CatalogRow): AutomationStudioProjectDatasetSummary {
  const dataset: AutomationStudioProjectDatasetSummary = {
    flowId: row.flow_id,
    datasetId: row.dataset_id,
    latestRunId: row.latest_run_id,
    latestUpdatedAt: row.latest_updated_at_ms,
    runCount: row.run_count,
    latestRecordCount: row.latest_record_count,
    latestTruncated: row.latest_truncated === 1,
    schemaDigest: row.schema_digest
  };
  if (row.label !== null) dataset.label = row.label;
  return dataset;
}

function serializedRows(rows: unknown, schema: AutomationStudioRecordSchema): string[] {
  if (!Array.isArray(rows)) throw new Error("Run dataset rows must be an array.");
  const fieldIds = new Set(schema.fields.map((field) => field.id));
  return rows.map((row: unknown) => {
    if (!isPlainObject(row)) throw new Error("Run dataset row must be an object.");
    for (const key of Object.keys(row)) {
      if (!fieldIds.has(key)) throw new Error("Run dataset row holds a key that is not in the stored schema.");
    }
    const rowJson = JSON.stringify(row);
    if (Buffer.byteLength(rowJson, "utf8") > AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.rowMaxBytes) throw new Error("Run dataset row exceeds the row size limit.");
    return rowJson;
  });
}

function storedSchema(value: unknown): AutomationStudioRecordSchema {
  const parsed = parseAutomationStudioRecordSchema(value);
  if (!parsed.ok) throw new Error("Invalid run dataset schema.");
  return storedAutomationStudioRecordSchema(parsed.schema);
}

function withNodeId(nodeIdsJson: string | undefined, nodeId: string): string[] {
  const nodeIds = nodeIdsJson === undefined ? [] : nodeIdsFromJson(nodeIdsJson);
  return nodeIds.includes(nodeId) ? nodeIds : [...nodeIds, nodeId];
}

function nodeIdsFromJson(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function rowFromStored(row: StoredRow): AutomationStudioRunDatasetRow {
  return JSON.parse(row.row_json) as AutomationStudioRunDatasetRow;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requiredId(value: unknown, kind: string): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) throw new Error(`Invalid ${kind} ID.`);
  return value;
}

// Node ids carry no character restriction, and attempt ids and batch keys are built from them, so
// these are bound as parameters and only held to a length and to having no control characters.
function requiredText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maxLength || hasControlCharacter(value)) throw new Error(`Invalid run dataset ${label}.`);
  return value;
}

/** True when the text holds a C0 control character or DEL. */
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

function requiredDatasetId(value: unknown): string {
  if (typeof value !== "string" || !AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.datasetIdPattern.test(value) || value === "." || value === "..") throw new Error("Invalid dataset ID.");
  return value;
}

function requiredDigest(value: unknown): string {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) throw new Error("Invalid run dataset schema digest.");
  return value;
}

function requiredWriteMode(value: unknown): AutomationStudioRecordWriteMode {
  const mode = AUTOMATION_STUDIO_RECORD_WRITE_MODES.find((candidate) => candidate === value);
  if (!mode) throw new Error("Invalid run dataset write mode.");
  return mode;
}

function requiredRunStatus(value: unknown): AutomationStudioDatasetRunStatus {
  const status = AUTOMATION_STUDIO_DATASET_RUN_STATUSES.find((candidate) => candidate === value);
  if (!status) throw new Error("Invalid run status.");
  return status;
}

function requiredExportFormat(value: unknown): AutomationStudioRunDatasetExportFormat {
  const format = AUTOMATION_STUDIO_RUN_DATASET_EXPORT_FORMATS.find((candidate) => candidate === value);
  if (!format) throw new Error("Invalid run dataset export format.");
  return format;
}

function optionalLabel(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value !== "string" || value.length < 1 || value.length > AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS.labelMaxLength) throw new Error("Invalid run dataset label.");
  return value;
}

// SQLite's lower() folds ASCII letters only, so a search matches non-ASCII text case-sensitively.
function optionalSearch(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value !== "string") throw new Error("Dataset search must be text.");
  const search = value.trim().toLowerCase();
  if (search.length > SEARCH_MAX_LENGTH) throw new Error(`Dataset search must not exceed ${SEARCH_MAX_LENGTH} characters.`);
  return search || null;
}

function isOrdinal(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) >= 1;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(`${label} must be a non-negative integer.`);
  return Number(value);
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Math.trunc(Number(value));
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}
