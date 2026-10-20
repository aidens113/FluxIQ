// Keyed content addresses (t745 design note D1, D4). A protected project holds
// one random address key per generation, sealed by the project's content
// protection: `content_address_keys` keeps the sealed form, and the partial
// unique index lets at most one row be current (`retired_at_ms is null`).
// Retired keys are kept, never deleted, so rows written under them stay
// verifiable and can be rekeyed later.
//
// `objects.content_address` is the keyed address (64 lower hex) of an object's
// plaintext, and `content_address_key_id` names the key it was made under; the
// check on the second column keeps the two set or null together. SQLite accepts
// a check that names another column on `add column`, so the pair is enforced by
// the schema. Like 0032 this migration is additive and nullable only: it runs
// before any key is in reach, so the objects already held are addressed later,
// by a store opened with a protection; the partial index on sealed unaddressed
// objects keeps that pass to the rows still to do, and the partial index on the
// key id keeps the pass after a rotation to the rows under another key.
//
// Durable removal (t745 u5). `content_address_scrub_requests` holds at most one
// row: a transaction that converts or deletes an old plaintext form records a
// request in the same commit, and the next protected open honours it (VACUUM,
// then a truncate checkpoint) and clears it only when both succeeded, so a
// crash or a busy database between the conversion and the scrub leaves the
// request for a later open. `object_pending_removals` names each object whose
// row was released (deleted because nothing references it) but whose file may
// still be on disk; the row goes in the releasing transaction, and the file and
// then the row are removed after commit, or by the next content store open.
import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";

export const AUTOMATION_STUDIO_CONTENT_ADDRESS_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0033_content_addresses",
  statements: [
    `create table content_address_keys (
      key_id text primary key check (length(key_id) = 20 and substr(key_id, 1, 4) = 'cak.' and substr(key_id, 5) not glob '*[^0-9a-f]*'),
      sealed blob not null,
      encryption text not null check (length(encryption) > 0),
      created_at_ms integer not null,
      retired_at_ms integer
    )`,
    "create unique index content_address_keys_current_idx on content_address_keys ((retired_at_ms is null)) where retired_at_ms is null",
    "alter table objects add column content_address text check (content_address is null or (length(content_address) = 64 and content_address not glob '*[^0-9a-f]*'))",
    "alter table objects add column content_address_key_id text check ((content_address is null) = (content_address_key_id is null))",
    "create index objects_content_address_idx on objects (content_address) where content_address is not null",
    "create index objects_sealed_unaddressed_idx on objects (object_id) where encryption is not null and content_address is null",
    "create index objects_content_address_key_idx on objects (content_address_key_id) where content_address_key_id is not null",
    "create table content_address_scrub_requests (singleton integer primary key check (singleton = 1), requested_at_ms integer not null)",
    "create table object_pending_removals (object_id text primary key, relative_path text not null, released_at_ms integer not null)"
  ]
};
