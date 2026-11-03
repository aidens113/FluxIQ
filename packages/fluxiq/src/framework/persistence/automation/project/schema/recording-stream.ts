import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";
import { foreignKeyGuards } from "./foreign-key-guards.ts";

/** Derived identity metadata follows immutable chunks; rebuilding it never rewrites their content. */
export const AUTOMATION_STUDIO_PROJECT_RECORDING_STREAM_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0025_recording_stream_identity_index",
  statements: [
    `create table recording_stream_heads (
      recording_id text primary key references recordings(recording_id) on delete cascade,
      generation text not null default (lower(hex(randomblob(16)))),
      indexed_cursor integer not null default 0 check (indexed_cursor >= 0),
      event_count integer not null default 0 check (event_count >= 0),
      action_count integer not null default 0 check (action_count >= 0),
      state_snapshot_count integer not null default 0 check (state_snapshot_count >= 0)
    )`,
    `create table recording_stream_entries (
      recording_id text not null references recording_stream_heads(recording_id) on delete cascade,
      entry_id text not null,
      public_sequence integer not null check (public_sequence >= 0),
      body_digest text not null check (length(body_digest) = 64 and body_digest not glob '*[^a-f0-9]*'),
      timestamp_json text,
      offset_json text,
      incarnation_cursor integer not null default 0,
      packet_key text,
      capture_digest text check (capture_digest is null or (length(capture_digest) = 64 and capture_digest not glob '*[^a-f0-9]*')),
      action_like integer not null check (action_like in (0, 1)),
      state_like integer not null check (state_like in (0, 1)),
      removed integer not null default 0 check (removed in (0, 1)),
      primary key (recording_id, entry_id),
      unique (recording_id, public_sequence)
    )`,
    `create table recording_stream_tombstones (
      recording_id text not null references recording_stream_heads(recording_id) on delete cascade,
      entry_id text not null,
      public_sequence integer not null check (public_sequence >= 0),
      body_digest text not null check (length(body_digest) = 64 and body_digest not glob '*[^a-f0-9]*'),
      timestamp_json text,
      offset_json text,
      incarnation_cursor integer not null check (incarnation_cursor > 0),
      packet_key text,
      capture_digest text check (capture_digest is null or (length(capture_digest) = 64 and capture_digest not glob '*[^a-f0-9]*')),
      primary key (recording_id, incarnation_cursor)
    )`,
    "create index recording_stream_tombstone_identity on recording_stream_tombstones (recording_id, entry_id, incarnation_cursor)",
    "create index recording_stream_tombstone_capture on recording_stream_tombstones (recording_id, entry_id, capture_digest)",
    "create index recording_stream_tombstone_event on recording_stream_tombstones (recording_id, json_extract(packet_key, '$[0]'), json_extract(packet_key, '$[1]'))",
    "create index recording_stream_tombstone_correlation on recording_stream_tombstones (recording_id, json_extract(packet_key, '$[0]'), json_extract(packet_key, '$[2]'))",
    ...foreignKeyGuards("recording_stream_heads", "recording_id", "recordings", "recording_id", false),
    ...foreignKeyGuards("recording_stream_entries", "recording_id", "recording_stream_heads", "recording_id", false),
    ...foreignKeyGuards("recording_stream_tombstones", "recording_id", "recording_stream_heads", "recording_id", false),
    `create table recording_stream_reconciliations (
      recording_id text primary key references recording_stream_heads(recording_id) on delete cascade,
      claim_id text not null,
      owner_pid integer not null check (owner_pid > 0),
      generation text not null,
      ended_at_ms integer not null,
      complete_count integer not null check (complete_count >= 0),
      complete_digest text not null check (length(complete_digest) = 64),
      first_sequence integer not null,
      last_sequence integer not null,
      chunk_sha256 text not null check (length(chunk_sha256) = 64)
    )`,
    ...foreignKeyGuards("recording_stream_reconciliations", "recording_id", "recording_stream_heads", "recording_id", false),
    `create trigger recording_stream_reconciliation_proof before update of complete_digest on recording_stream_reconciliations
      when new.complete_digest is not old.complete_digest begin
      select raise(abort, 'Recording reconciliation proof is immutable.');
    end`,
    "create index recording_stream_removed_entries on recording_stream_entries (recording_id, removed)",
    `create trigger recording_stream_chunk_open before insert on recording_event_chunks begin
      select case when exists (select 1 from recordings where recording_id = new.recording_id and ended_at_ms is not null)
        and not exists (select 1 from recording_stream_reconciliations c join recordings r using(recording_id)
          join recording_stream_heads h using(recording_id) where c.recording_id = new.recording_id
          and c.ended_at_ms = r.ended_at_ms and c.complete_count = r.event_count and c.generation = h.generation
          and c.first_sequence = new.first_sequence and c.last_sequence = new.last_sequence and c.chunk_sha256 = new.sha256
          and h.indexed_cursor = new.first_sequence - 1 and h.event_count + new.event_count <= c.complete_count
          and h.indexed_cursor = coalesce((select max(last_sequence) from recording_event_chunks where recording_id = new.recording_id), 0))
        then raise(abort, 'Finalized recordings are immutable.') end;
      select case when exists (select 1 from recording_event_chunks where recording_id = new.recording_id
        and first_sequence <= new.last_sequence and last_sequence >= new.first_sequence)
        then raise(abort, 'Recording storage cursor conflict.') end;
    end`,
    `create trigger recording_stream_reconciliation_consume after insert on recording_event_chunks begin
      delete from recording_stream_reconciliations where recording_id = new.recording_id
        and first_sequence = new.first_sequence and last_sequence = new.last_sequence and chunk_sha256 = new.sha256;
    end`,
    `create trigger recording_stream_summary_immutable before update of ended_at_ms on recordings
      when old.ended_at_ms is not null and new.ended_at_ms is not old.ended_at_ms begin
      select raise(abort, 'Finalized recording end time conflict.');
    end`,
    `create trigger recording_stream_summary_counts after update of event_count, action_count, state_snapshot_count on recordings
      when exists (select 1 from recording_stream_heads where recording_id = new.recording_id and indexed_cursor =
        coalesce((select max(last_sequence) from recording_event_chunks where recording_id = new.recording_id), 0)
        and (event_count != new.event_count or action_count != new.action_count or state_snapshot_count != new.state_snapshot_count)) begin
      update recordings set event_count = (select event_count from recording_stream_heads where recording_id = new.recording_id),
        action_count = (select action_count from recording_stream_heads where recording_id = new.recording_id),
        state_snapshot_count = (select state_snapshot_count from recording_stream_heads where recording_id = new.recording_id)
        where recording_id = new.recording_id;
    end`,
    `create trigger recording_stream_head_delete after delete on recording_stream_heads begin
      delete from recording_stream_entries where recording_id = old.recording_id;
      delete from recording_stream_tombstones where recording_id = old.recording_id;
      delete from recording_stream_reconciliations where recording_id = old.recording_id;
    end`,
    `create trigger recording_stream_recording_unlink before delete on recordings begin
      delete from object_references where owner_kind = 'recording' and owner_id = old.recording_id and purpose = 'event_chunk'
        and object_id in (select object_id from recording_event_chunks where recording_id = old.recording_id)
        and reference_id in (select 'reference:recording:' || recording_id || ':' || first_sequence from recording_event_chunks where recording_id = old.recording_id);
    end`,
    `create trigger recording_stream_recording_delete after delete on recordings begin
      delete from recording_stream_heads where recording_id = old.recording_id;
      delete from recording_event_chunks where recording_id = old.recording_id;
    end`,
    `create trigger recording_stream_chunk_delete after delete on recording_event_chunks begin
      delete from recording_stream_heads where recording_id = old.recording_id;
    end`,
    `create trigger recording_stream_chunk_update after update of recording_id, first_sequence, last_sequence, object_id, sha256, event_count on recording_event_chunks begin
      delete from recording_stream_heads where recording_id in (old.recording_id, new.recording_id);
    end`,
    `create trigger recording_stream_chunk_insert after insert on recording_event_chunks begin
      delete from recording_stream_heads where recording_id = new.recording_id and indexed_cursor >= new.first_sequence;
    end`
  ]
};
