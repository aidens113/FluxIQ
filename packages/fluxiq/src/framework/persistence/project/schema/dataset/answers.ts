import type { AutomationStudioSchemaMigration } from "../../migrations/contracts/index.ts";

// 0024 — run dataset answers. A dataset's collected rows stay in run_dataset_rows
// as capture wrote them; its answer, the rows its record output's `process`
// declaration keeps, goes beside them, with `ordinal` as the answer position and
// each row's source attempt and batch. run_datasets gains the declaration
// (`process_json`, fixed by the dataset's first batch), the processing account
// (`processing_json`) and when it was processed; all three are null for a
// dataset written before this migration or not yet processed.
export const AUTOMATION_STUDIO_PROJECT_RUN_DATASET_ANSWER_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0024_run_dataset_answers",
  statements: [
    `create table run_dataset_answer_rows (
      run_id text not null,
      dataset_id text not null,
      ordinal integer not null check (ordinal >= 1),
      attempt_id text not null,
      batch_key text not null,
      row_json text not null,
      primary key (run_id, dataset_id, ordinal)
    )`,
    "alter table run_datasets add column process_json text",
    "alter table run_datasets add column processing_json text",
    "alter table run_datasets add column processed_at_ms integer"
  ]
};
