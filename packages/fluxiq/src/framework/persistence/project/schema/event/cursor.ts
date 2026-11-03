import type { AutomationStudioSchemaMigration } from "../../migrations/contracts/index.ts";

export const AUTOMATION_STUDIO_PROJECT_EVENT_CURSOR_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0006_event_chunk_time_ranges",
  statements: [
    "alter table runtime_event_chunks add column first_event_at_ms integer",
    "alter table runtime_event_chunks add column last_event_at_ms integer",
    "alter table recording_event_chunks add column first_event_at_ms integer",
    "alter table recording_event_chunks add column last_event_at_ms integer",
    "create index runtime_event_chunks_time_idx on runtime_event_chunks (run_id, last_event_at_ms, first_event_at_ms, first_sequence)",
    "create index recording_event_chunks_time_idx on recording_event_chunks (recording_id, last_event_at_ms, first_event_at_ms, first_sequence)"
  ]
};
