import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";

/** Private exclusion policy survives schema projection; null marks legacy datasets with unknown history. */
export const AUTOMATION_STUDIO_PROJECT_RUN_DATASET_EXCLUSIONS_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0040_run_dataset_exclusions",
  statements: [
    "alter table run_datasets add column excluded_field_digests_json text",
    "alter table run_datasets add column answer_rows_retained integer not null default 0 check (answer_rows_retained in (0, 1))",
    "alter table run_dataset_batches add column receipt_digest text"
  ]
};
