import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";

export const AUTOMATION_STUDIO_CANDIDATE_VERIFICATION_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0025_candidate_verification_receipts_v1",
  statements: [
    "create table if not exists candidate_verification_attempts (attempt_id text primary key, request_digest text not null, record_digest text not null, record_json text not null, updated_at_ms integer not null)"
  ]
};
