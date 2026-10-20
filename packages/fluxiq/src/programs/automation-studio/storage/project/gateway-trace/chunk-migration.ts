// Chunked event bodies for persisted client gateway traces (trace-offline-
// trials-plan, lane T P3). 0030 kept each event's JSON inline or as one
// content object; P2 measured that JSON at 92-96% of a trace's bytes, mostly
// views repeated from command to command. A large event is now cut into
// content-defined chunks (`chunk-bounds.ts`), each stored once per project in
// `client_gateway_trace_chunks` keyed by the SHA-256 of its raw bytes, and the
// event row keeps the ordered digests and the body's byte length.
//
// Chunks live in a table, not the content store: a 900 KB event is about
// two hundred 4 KiB chunks, and a content object per chunk would be a file, an
// object row and a reference row each, thousands per trace. Small blobs in
// SQLite are its strong case, and `client_gateway_trace_chunk_uses` (one row
// per trace and chunk) lets a trace deletion free exactly the chunks no other
// trace uses, in its own transaction, with no sweep.
//
// 0030 already holds data and its check allows only inline or object rows, so
// the events table is rebuilt with the third form beside the first two. Every
// existing row is copied as it was and still reads; 0030 itself is unchanged.
import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";

const EVENT_COLUMNS = "trace_id, sequence, event_id, stream, kind, message_type, command_id, recording_id, causation_event_id, event_json, event_object_id";

export const AUTOMATION_STUDIO_CLIENT_GATEWAY_TRACE_CHUNK_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0031_client_gateway_trace_event_chunks",
  statements: [
    `create table client_gateway_trace_events_chunked (
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
      event_chunk_digests blob,
      event_byte_length integer,
      check ((event_json is not null) + (event_object_id is not null) + (event_chunk_digests is not null) = 1),
      check ((event_chunk_digests is null) = (event_byte_length is null)),
      check (event_chunk_digests is null or (length(event_chunk_digests) > 0 and length(event_chunk_digests) % 32 = 0)),
      primary key (trace_id, sequence)
    )`,
    `insert into client_gateway_trace_events_chunked (${EVENT_COLUMNS}) select ${EVENT_COLUMNS} from client_gateway_trace_events`,
    "drop table client_gateway_trace_events",
    "alter table client_gateway_trace_events_chunked rename to client_gateway_trace_events",
    "create index client_gateway_trace_events_command_idx on client_gateway_trace_events (trace_id, command_id, sequence)",
    "create index client_gateway_trace_events_recording_idx on client_gateway_trace_events (trace_id, recording_id, sequence)",
    "create index client_gateway_trace_events_causation_idx on client_gateway_trace_events (trace_id, causation_event_id, sequence)",
    `create table client_gateway_trace_chunks (
      digest blob primary key check (length(digest) = 32),
      encoding text not null check (encoding in ('raw', 'deflate')),
      byte_length integer not null check (byte_length > 0),
      stored blob not null
    )`,
    `create table client_gateway_trace_chunk_uses (
      trace_id text not null,
      digest blob not null,
      primary key (trace_id, digest)
    ) without rowid`,
    "create index client_gateway_trace_chunk_uses_digest_idx on client_gateway_trace_chunk_uses (digest, trace_id)"
  ]
};
