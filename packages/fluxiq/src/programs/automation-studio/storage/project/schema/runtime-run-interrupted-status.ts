// 0024_runtime_run_interrupted_status -- a run can be stored as `interrupted`: it was
// in flight when the process that ran it ended, and nobody knows whether its
// last act landed.
//
// SQLite cannot alter a column's CHECK, so the table is rebuilt in the
// migration's one transaction, and every row is copied across unchanged. The
// rebuild never renames `runtime_runs`: a rename rewrites the table name inside
// the foreign-key guard triggers that other tables hold (`run_datasets`,
// `adaptations`, `runtime_event_chunks`, `compiled_plan_adoptions`), and a
// rename of the copy back would be refused while those triggers name a table
// that is gone. Instead the rows go to a plain copy, the table is dropped (its
// own indexes and triggers with it, the other tables' guards untouched) and
// created again under the same name, and the rows come back before the guards
// are recreated, so a row whose referenced object was since removed is kept
// as it was rather than refused.
//
// Its id sorts after `0024_run_dataset_answers`, the last of the project
// administration set, and before `0025`: the stores that append their own
// `0025`-`0028` after that set need its ids ascending.
import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";
import { foreignKeyGuards } from "./foreign-key-guards.ts";

const COLUMNS = [
  "run_id", "flow_id", "flow_revision", "compiled_artifact_id", "status", "trigger_kind", "queued_at_ms", "started_at_ms", "finished_at_ms",
  "action_count", "effect_count", "error_count", "adaptation_count", "last_event_sequence", "input_object_id", "output_object_id",
  "error_object_id", "updated_at_ms", "summary_json", "result_verification_status", "result_check_epoch"
].join(", ");

export const AUTOMATION_STUDIO_PROJECT_RUNTIME_RUN_INTERRUPTED_STATUS_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0024_runtime_run_interrupted_status",
  statements: [
    `create table runtime_runs_interrupted_copy as select ${COLUMNS} from runtime_runs`,
    "drop table runtime_runs",
    `create table runtime_runs (
      run_id text primary key,
      flow_id text not null,
      flow_revision integer not null check (flow_revision > 0),
      compiled_artifact_id text,
      status text not null check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'interrupted')),
      trigger_kind text not null,
      queued_at_ms integer not null,
      started_at_ms integer,
      finished_at_ms integer,
      action_count integer not null default 0 check (action_count >= 0),
      effect_count integer not null default 0 check (effect_count >= 0),
      error_count integer not null default 0 check (error_count >= 0),
      adaptation_count integer not null default 0 check (adaptation_count >= 0),
      last_event_sequence integer not null default 0 check (last_event_sequence >= 0),
      input_object_id text,
      output_object_id text,
      error_object_id text,
      updated_at_ms integer not null,
      summary_json text not null default '{}',
      result_verification_status text check (result_verification_status is null or result_verification_status in ('confirmed', 'refuted', 'unverified', 'no_result')),
      result_check_epoch integer not null default 1 check (result_check_epoch > 0)
    )`,
    `insert into runtime_runs (${COLUMNS}) select ${COLUMNS} from runtime_runs_interrupted_copy`,
    "drop table runtime_runs_interrupted_copy",
    "create index runtime_runs_started_idx on runtime_runs (started_at_ms desc, run_id desc)",
    "create index runtime_runs_flow_status_idx on runtime_runs (flow_id, status, started_at_ms desc, run_id desc)",
    "create index runtime_runs_updated_idx on runtime_runs (updated_at_ms desc, run_id desc)",
    "create index runtime_runs_flow_updated_idx on runtime_runs (flow_id, updated_at_ms desc, run_id desc)",
    "create index runtime_runs_status_updated_idx on runtime_runs (status, updated_at_ms desc, run_id desc)",
    "create index runtime_runs_result_check_idx on runtime_runs (flow_id, result_check_epoch, finished_at_ms desc, run_id)",
    ...foreignKeyGuards("runtime_runs", "flow_id", "flows", "flow_id", false),
    ...foreignKeyGuards("runtime_runs", "compiled_artifact_id", "compiled_artifacts", "artifact_id"),
    ...foreignKeyGuards("runtime_runs", "input_object_id", "objects", "object_id"),
    ...foreignKeyGuards("runtime_runs", "output_object_id", "objects", "object_id"),
    ...foreignKeyGuards("runtime_runs", "error_object_id", "objects", "object_id")
  ]
};
