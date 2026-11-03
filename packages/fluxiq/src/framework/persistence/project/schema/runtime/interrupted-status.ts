import type { AutomationStudioSchemaMigration } from "../../migrations/contracts/index.ts";
import { foreignKeyGuards } from "../guards/index.ts";

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
