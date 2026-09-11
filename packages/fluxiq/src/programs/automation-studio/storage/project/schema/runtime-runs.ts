// 0015 — the runtime run summary envelope.
import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";

export const AUTOMATION_STUDIO_PROJECT_RUNTIME_SUMMARY_ENVELOPE_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0015_runtime_summary_envelope",
  statements: [
    "alter table runtime_runs add column summary_json text not null default '{}'"
  ]
};
