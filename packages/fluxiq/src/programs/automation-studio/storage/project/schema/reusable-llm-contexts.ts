// 0016-0018 — reusable LLM context records, their audit events, and the
// validation state layered on top.
import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";
import { foreignKeyGuards } from "./foreign-key-guards.ts";

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

export const AUTOMATION_STUDIO_PROJECT_REUSABLE_LLM_CONTEXT_AUDIT_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0017_reusable_llm_context_audit",
  statements: [
    `create table reusable_llm_context_audit_events (
      event_id text primary key,
      event_type text not null,
      record_id text,
      flow_id text,
      subflow_id text,
      domain_id text,
      actor_id text,
      detail_json text not null default '{}',
      created_at_ms integer not null
    )`,
    "create index reusable_llm_context_audit_scope_idx on reusable_llm_context_audit_events (flow_id, subflow_id, domain_id, created_at_ms desc, event_id)",
    "create index reusable_llm_context_audit_record_idx on reusable_llm_context_audit_events (record_id, created_at_ms, event_id)"
  ]
};

export const AUTOMATION_STUDIO_PROJECT_REUSABLE_LLM_CONTEXT_VALIDATION_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0018_reusable_llm_context_validation",
  statements: [
    "alter table reusable_llm_contexts add column validation_state text not null default 'unknown' check (validation_state in ('unknown', 'validated', 'applied'))",
    "create index reusable_llm_context_validation_idx on reusable_llm_contexts (validation_state, outcome, reviewer_state, created_at_ms desc, record_id)"
  ]
};
