import type { AutomationStudioSchemaMigration } from "../../migrations/contracts/index.ts";

export const AUTOMATION_STUDIO_PROJECT_RETENTION_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0007_event_retention",
  statements: [
    "alter table runtime_event_chunks add column archived_at_ms integer",
    "alter table recording_event_chunks add column archived_at_ms integer",
    "create index runtime_event_chunks_archive_idx on runtime_event_chunks (run_id, archived_at_ms, last_sequence, chunk_id)",
    "create index recording_event_chunks_archive_idx on recording_event_chunks (recording_id, archived_at_ms, last_sequence, chunk_id)"
  ]
};
