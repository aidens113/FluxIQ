// 0005-0007 — event writer leases and spools, then the chunk time-range
// cursors and archival columns layered onto the runtime and recording chunks.
import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";

export const AUTOMATION_STUDIO_PROJECT_STREAM_SPOOL_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0005_event_stream_spools",
  statements: [
    `create table event_writer_leases (
      stream_kind text not null check (stream_kind in ('runtime', 'recording')),
      stream_id text not null,
      lease_token text not null,
      owner_id text not null,
      acquired_at_ms integer not null,
      heartbeat_at_ms integer not null,
      expires_at_ms integer not null,
      primary key (stream_kind, stream_id)
    )`,
    "create index event_writer_leases_expiry_idx on event_writer_leases (expires_at_ms, stream_kind, stream_id)",
    `create table event_spools (
      spool_id text primary key,
      stream_kind text not null check (stream_kind in ('runtime', 'recording')),
      stream_id text not null,
      lease_token text not null,
      first_sequence integer,
      last_sequence integer,
      event_count integer not null default 0 check (event_count >= 0),
      byte_count integer not null default 0 check (byte_count >= 0),
      spool_path text not null,
      status text not null check (status in ('active', 'sealed', 'recovered', 'abandoned')),
      created_at_ms integer not null,
      updated_at_ms integer not null
    )`,
    "create index event_spools_stream_status_idx on event_spools (stream_kind, stream_id, status, first_sequence)",
    "create index event_spools_status_idx on event_spools (status, updated_at_ms, spool_id)"
  ]
};

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

export const AUTOMATION_STUDIO_PROJECT_RETENTION_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0007_event_retention",
  statements: [
    "alter table runtime_event_chunks add column archived_at_ms integer",
    "alter table recording_event_chunks add column archived_at_ms integer",
    "create index runtime_event_chunks_archive_idx on runtime_event_chunks (run_id, archived_at_ms, last_sequence, chunk_id)",
    "create index recording_event_chunks_archive_idx on recording_event_chunks (recording_id, archived_at_ms, last_sequence, chunk_id)"
  ]
};
