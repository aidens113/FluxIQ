// 0020 — typed adaptation columns for matching a change to the failure it
// answers: the failure signature (indexed with its Flow), the confidence tier
// its validation results earn, and the entry point that produced it. Everything
// else about the change stays in `status_detail_json`.
//
// Forward-safe on an existing project database: every column is nullable with
// no default, so the statements add columns and indexes and rewrite no row. A
// null tier marks a row the adaptation store has not mapped yet, because every
// store write sets a tier. The partial index lists exactly those rows, so the
// store can map rows written before this migration when it opens, without
// scanning the table.
import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";

export const AUTOMATION_STUDIO_PROJECT_ADAPTATION_MATCHING_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0020_adaptation_matching_columns",
  statements: [
    "alter table adaptations add column failure_signature text check (failure_signature is null or length(failure_signature) between 1 and 512)",
    "alter table adaptations add column confidence_tier text check (confidence_tier is null or confidence_tier in ('unverified', 'provisional', 'established'))",
    "alter table adaptations add column origin_entry_point text check (origin_entry_point is null or origin_entry_point in ('instruction', 'run_failure', 'edge_case'))",
    "create index adaptations_flow_failure_signature_idx on adaptations (flow_id, failure_signature, updated_at_ms desc, adaptation_id desc)",
    "create index adaptations_unmapped_matching_idx on adaptations (adaptation_id) where confidence_tier is null"
  ]
};
