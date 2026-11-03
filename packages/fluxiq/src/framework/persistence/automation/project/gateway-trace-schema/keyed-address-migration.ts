// Keyed content addresses for persisted gateway traces (t745 design note D2, D4).
// In a protected project a chunk's digest is the keyed address of its bytes,
// cut by a keyed gear table, so the database no longer confirms a guessed chunk
// or a guessed event body; an artifact's digest column holds its keyed address;
// and the manifest (which carries the artifacts' plain SHA-256 for the wire) is
// sealed. Each row names the key it was made under: `null` always means the old
// form (plain SHA-256, public gear, plaintext manifest), which every row 0031
// and 0032 wrote is, and which a store without protection still writes.
//
// Like 0032 and 0033 this is additive and nullable only: it runs before any key
// is in reach. Rows already held stay in their old form and keep reading; the
// partial indexes keep a later rekey pass to the rows still in that form: the
// unkeyed ones, and after a rotation those under a retired key (t745 u5).
import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";

export const AUTOMATION_STUDIO_CLIENT_GATEWAY_TRACE_KEYED_ADDRESS_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0034_client_gateway_trace_keyed_addresses",
  statements: [
    "alter table client_gateway_trace_chunks add column address_key_id text check (address_key_id is null or length(address_key_id) > 0)",
    `alter table client_gateway_trace_events add column event_chunk_address_key_id text
      check (event_chunk_address_key_id is null or (length(event_chunk_address_key_id) > 0 and event_chunk_digests is not null))`,
    "alter table client_gateway_trace_artifacts add column digest_key_id text check (digest_key_id is null or length(digest_key_id) > 0)",
    "alter table client_gateway_traces add column manifest_encryption text check (manifest_encryption is null or length(manifest_encryption) > 0)",
    "create index client_gateway_trace_chunks_unkeyed_idx on client_gateway_trace_chunks (digest) where address_key_id is null",
    "create index client_gateway_trace_events_unkeyed_idx on client_gateway_trace_events (trace_id, sequence) where event_chunk_address_key_id is null",
    "create index client_gateway_trace_artifacts_unkeyed_idx on client_gateway_trace_artifacts (trace_id, artifact_id) where digest_key_id is null",
    "create index client_gateway_traces_unsealed_manifest_idx on client_gateway_traces (trace_id) where manifest_encryption is null",
    "create index client_gateway_trace_chunks_key_idx on client_gateway_trace_chunks (address_key_id) where address_key_id is not null",
    "create index client_gateway_trace_events_key_idx on client_gateway_trace_events (event_chunk_address_key_id) where event_chunk_address_key_id is not null",
    "create index client_gateway_trace_artifacts_key_idx on client_gateway_trace_artifacts (digest_key_id) where digest_key_id is not null"
  ]
};
