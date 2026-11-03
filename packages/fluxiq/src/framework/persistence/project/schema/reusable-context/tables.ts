import type { AutomationStudioSchemaMigration } from "../../migrations/contracts/index.ts";
import { foreignKeyGuards } from "../guards/index.ts";

export const AUTOMATION_STUDIO_PROJECT_REUSABLE_LLM_CONTEXT_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0016_reusable_llm_context",
  statements: [
    `create table reusable_llm_contexts (
      record_id text primary key,
      flow_id text not null,
      subflow_id text,
      domain_id text not null,
      evidence_kind text not null,
      contract_version text not null,
      evidence_schema_version text not null,
      sanitizer_version text not null,
      compatibility_tags_json text not null,
      outcome text not null check (outcome in ('succeeded', 'failed', 'rejected', 'reverted', 'unknown')),
      reviewer_state text not null check (reviewer_state in ('unreviewed', 'approved', 'rejected', 'reverted')),
      source_run_ids_json text not null,
      source_adaptation_ids_json text not null,
      prompt_object_id text not null,
      prompt_reference_id text not null,
      byte_count integer not null check (byte_count >= 0),
      content_digest text not null,
      created_at_ms integer not null,
      last_used_at_ms integer not null,
      expires_at_ms integer not null check (expires_at_ms > created_at_ms)
    )`,
    "create index reusable_llm_context_scope_idx on reusable_llm_contexts (flow_id, subflow_id, domain_id, expires_at_ms, created_at_ms desc, record_id)",
    "create index reusable_llm_context_expiry_idx on reusable_llm_contexts (expires_at_ms, record_id)",
    "create index reusable_llm_context_digest_idx on reusable_llm_contexts (content_digest, record_id)",
    ...foreignKeyGuards("reusable_llm_contexts", "prompt_object_id", "objects", "object_id", false)
  ]
};
