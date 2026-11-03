import type { AutomationStudioSchemaMigration } from "../migrations/contracts/index.ts";

export const AUTOMATION_STUDIO_PROJECT_RESULT_CHECK_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0022_result_checks",
  statements: [
    `alter table runtime_runs add column result_verification_status text
       check (result_verification_status is null
              or result_verification_status in ('confirmed', 'refuted', 'unverified', 'no_result'))`,
    "alter table runtime_runs add column result_check_epoch integer not null default 1 check (result_check_epoch > 0)",
    "create index if not exists runtime_runs_result_check_idx on runtime_runs (flow_id, result_check_epoch, finished_at_ms desc, run_id)"
  ]
};
