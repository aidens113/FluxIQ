// Gateway trace chunks under the project's content protection (trace-offline-
// trials-plan, lane T P3-E). A chunk holds page content, so a store with a
// content protection seals each chunk's stored bytes as protected content-store
// objects are sealed, and keeps the protection's envelope beside them, in the
// same form as `objects.encryption`. `null` marks a chunk that is not sealed:
// every chunk 0031 wrote, and chunks a store without protection writes.
//
// This migration does not seal the chunks already held. A migration is SQL
// run before any key is in reach (the key resolver is the host's, and a host
// without protection must still open the database), so it cannot. Instead a
// store opened with a protection seals every unsealed chunk as it opens, and
// seals an unsealed chunk again whenever a write reuses it (`../gateway-trace-chunk-rows/protect-chunks.ts`,
// `../gateway-trace-chunk-rows/write-chunks.ts`). The partial index keeps that check to the unsealed rows.
import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";

export const AUTOMATION_STUDIO_CLIENT_GATEWAY_TRACE_CHUNK_PROTECTION_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0032_client_gateway_trace_chunk_protection",
  statements: [
    "alter table client_gateway_trace_chunks add column encryption text check (encryption is null or length(encryption) > 0)",
    "create index client_gateway_trace_chunks_unsealed_idx on client_gateway_trace_chunks (digest) where encryption is null"
  ]
};
