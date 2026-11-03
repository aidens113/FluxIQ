import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";

/**
 * Runs after the whole administration ledger, so its ID must sort after the
 * last administration migration. It was `0025_candidate_verification_receipts_v1`
 * until `0025_recording_stream_identity_index` joined the administration list
 * and sorted after it; the table is created with `if not exists`, so a project
 * that applied the old ID simply records this one too.
 */
export const AUTOMATION_STUDIO_CANDIDATE_VERIFICATION_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0029_candidate_verification_receipts_v1",
  statements: [
    "create table if not exists candidate_verification_attempts (attempt_id text primary key, request_digest text not null, record_digest text not null, record_json text not null, updated_at_ms integer not null)"
  ]
};
