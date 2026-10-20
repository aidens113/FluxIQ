// The tables of persisted client gateway traces (trace-offline-trials-plan,
// lane T P2, D10). One row per manifest, one per delivered event keyed by
// (trace, sequence), one per captured artifact. An event's JSON is kept inline
// below the object threshold, otherwise in the project content store and named
// here by its object id: exactly one of the two columns is set. Artifact bytes
// always live in the content store, pinned by an owner reference.
import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";

export const AUTOMATION_STUDIO_CLIENT_GATEWAY_TRACE_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0030_client_gateway_traces",
  statements: [
    `create table if not exists client_gateway_traces (
      trace_id text primary key,
      episode_id text not null,
      activity text not null,
      origin_kind text not null,
      started_at text not null,
      closed_at text,
      claimed_completeness text not null,
      manifest_json text not null
    )`,
    "create index if not exists client_gateway_traces_episode_idx on client_gateway_traces (episode_id, started_at, trace_id)",
    `create table if not exists client_gateway_trace_events (
      trace_id text not null,
      sequence integer not null check (sequence > 0),
      event_id text not null,
      stream text not null,
      kind text not null,
      message_type text,
      command_id text,
      recording_id text,
      causation_event_id text,
      event_json text,
      event_object_id text,
      check ((event_json is null) <> (event_object_id is null)),
      primary key (trace_id, sequence)
    )`,
    "create index if not exists client_gateway_trace_events_command_idx on client_gateway_trace_events (trace_id, command_id, sequence)",
    "create index if not exists client_gateway_trace_events_recording_idx on client_gateway_trace_events (trace_id, recording_id, sequence)",
    "create index if not exists client_gateway_trace_events_causation_idx on client_gateway_trace_events (trace_id, causation_event_id, sequence)",
    `create table if not exists client_gateway_trace_artifacts (
      trace_id text not null,
      artifact_id text not null,
      object_id text not null,
      sha256 text not null,
      byte_length integer not null check (byte_length >= 0),
      primary key (trace_id, artifact_id)
    )`
  ]
};
