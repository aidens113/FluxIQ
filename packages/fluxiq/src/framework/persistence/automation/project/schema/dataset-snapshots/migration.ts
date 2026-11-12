import type { AutomationStudioSchemaMigration } from "../../../schema-migrations.ts";
import { foreignKeyGuards } from "../foreign-key-guards.ts";

/** Independent of run datasets: immutable source occurrences never fabricate a runtime session. */
export const AUTOMATION_STUDIO_PROJECT_DATASET_SNAPSHOT_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0037_dataset_snapshots",
  statements: [
    "create table dataset_snapshots (snapshot_id text primary key, row_count integer not null check (row_count >= 0), created_at_ms integer not null)",
    "create table dataset_snapshot_rows (snapshot_id text not null, ordinal integer not null check (ordinal >= 1), occurrence_id text not null, row_json text not null, primary key (snapshot_id, ordinal), unique (snapshot_id, occurrence_id))",
    ...foreignKeyGuards("dataset_snapshot_rows", "snapshot_id", "dataset_snapshots", "snapshot_id", false)
  ]
};
