// 0004 — idempotent mutation records and the entities each one touched.
import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";
import { foreignKeyGuards } from "./foreign-key-guards.ts";

export const AUTOMATION_STUDIO_PROJECT_MUTATION_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0004_idempotent_mutations",
  statements: [
    `create table mutation_records (
      mutation_id text primary key,
      operation_kind text not null,
      owner_kind text not null,
      owner_id text not null,
      request_digest text not null,
      status text not null check (status in ('started', 'committed', 'failed')),
      response_json text,
      error_json text,
      first_change_sequence integer,
      last_change_sequence integer,
      created_at_ms integer not null,
      updated_at_ms integer not null,
      completed_at_ms integer,
      expires_at_ms integer
    )`,
    "create index mutation_records_owner_idx on mutation_records (owner_kind, owner_id, updated_at_ms desc, mutation_id)",
    "create index mutation_records_status_idx on mutation_records (status, updated_at_ms, mutation_id)",
    "create index mutation_records_expiry_idx on mutation_records (expires_at_ms, mutation_id)",
    `create table mutation_touched_entities (
      mutation_id text not null,
      entity_kind text not null,
      entity_id text not null,
      operation text not null,
      revision integer,
      primary key (mutation_id, entity_kind, entity_id)
    )`,
    "create index mutation_touched_entities_entity_idx on mutation_touched_entities (entity_kind, entity_id, mutation_id)",
    ...foreignKeyGuards("mutation_touched_entities", "mutation_id", "mutation_records", "mutation_id", false)
  ]
};
