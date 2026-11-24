import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";

/**
 * Each batch's captured field ids, from its own stored schema at write time (t998), so the end-of-run automatic answer
 * reads a captured field an item does not show as "not shown", as the answer-first feed does. Null marks a batch
 * written before this migration: its captured fields are unknown, and its rows keep missing-evidence semantics.
 */
export const AUTOMATION_STUDIO_PROJECT_RUN_DATASET_CAPTURED_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0041_run_dataset_captured_fields",
  statements: ["alter table run_dataset_batches add column captured_fields_json text"]
};
