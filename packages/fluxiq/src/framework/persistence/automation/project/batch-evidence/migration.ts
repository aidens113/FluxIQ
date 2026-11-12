// Private source evidence for a capture batch. Nullable for older batches; never reconstructed from processed rows.
import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";

export const AUTOMATION_STUDIO_PROJECT_RUN_DATASET_EVIDENCE_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0036_run_dataset_evidence",
  statements: ["alter table run_dataset_batches add column evidence_json text"]
};
