import type { AutomationStudioSchemaMigration } from "../../migrations/contracts/index.ts";

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
