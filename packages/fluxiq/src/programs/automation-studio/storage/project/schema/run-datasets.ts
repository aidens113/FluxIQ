// 0019 — run datasets: the rows a run stores per dataset, the capture batches
// that wrote them, each run's dataset summary, the project catalog of tables per
// Flow, and typed export and deletion audit events with no free-text column.
import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";
import { foreignKeyGuards } from "./foreign-key-guards.ts";

export const AUTOMATION_STUDIO_PROJECT_RUN_DATASET_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0019_run_datasets",
  statements: [
    `create table run_datasets (
      run_id text not null,
      dataset_id text not null,
      flow_id text not null,
      label text,
      schema_json text not null,
      schema_digest text not null,
      node_ids_json text not null default '[]',
      record_count integer not null default 0 check (record_count >= 0),
      invalid_count integer not null default 0 check (invalid_count >= 0),
      truncated integer not null default 0 check (truncated in (0, 1)),
      created_at_ms integer not null,
      updated_at_ms integer not null,
      primary key (run_id, dataset_id)
    )`,
    `create table run_dataset_rows (
      run_id text not null,
      dataset_id text not null,
      ordinal integer not null check (ordinal >= 1),
      attempt_id text not null,
      batch_key text not null,
      row_json text not null,
      primary key (run_id, dataset_id, ordinal)
    )`,
    // One row per capture batch. A batch key repeats only when a capture is retried, and the
    // retry replaces the batch, so the dataset's counts are always the sum over these rows.
    `create table run_dataset_batches (
      run_id text not null,
      dataset_id text not null,
      batch_key text not null,
      attempt_id text not null,
      node_id text not null,
      row_count integer not null default 0 check (row_count >= 0),
      invalid_count integer not null default 0 check (invalid_count >= 0),
      truncated integer not null default 0 check (truncated in (0, 1)),
      created_at_ms integer not null,
      updated_at_ms integer not null,
      primary key (run_id, dataset_id, batch_key)
    )`,
    `create table run_dataset_audit_events (
      event_id text primary key,
      event_type text not null check (event_type in ('exported', 'export_truncated', 'export_failed', 'deleted')),
      run_id text not null,
      dataset_id text,
      actor_id text,
      format text check (format is null or format in ('csv', 'json')),
      row_count integer not null default 0 check (row_count >= 0),
      byte_count integer not null default 0 check (byte_count >= 0),
      created_at_ms integer not null
    )`,
    `create table run_dataset_catalog (
      flow_id text not null,
      dataset_id text not null,
      label text,
      latest_run_id text not null,
      latest_updated_at_ms integer not null,
      run_count integer not null check (run_count >= 1),
      latest_record_count integer not null check (latest_record_count >= 0),
      latest_truncated integer not null check (latest_truncated in (0, 1)),
      schema_digest text not null,
      primary key (flow_id, dataset_id)
    )`,
    "create index run_datasets_run_idx on run_datasets (run_id, updated_at_ms desc, dataset_id)",
    "create index run_datasets_flow_dataset_idx on run_datasets (flow_id, dataset_id, updated_at_ms desc, run_id)",
    // A retried batch replaces its rows by batch key; without this index every retry
    // would scan the dataset's rows to find them.
    "create index run_dataset_rows_batch_idx on run_dataset_rows (run_id, dataset_id, batch_key)",
    "create index run_dataset_audit_events_run_idx on run_dataset_audit_events (run_id, dataset_id, created_at_ms, event_id)",
    "create index run_dataset_catalog_updated_idx on run_dataset_catalog (latest_updated_at_ms desc, flow_id, dataset_id)",
    ...foreignKeyGuards("run_datasets", "run_id", "runtime_runs", "run_id", false)
  ]
};
