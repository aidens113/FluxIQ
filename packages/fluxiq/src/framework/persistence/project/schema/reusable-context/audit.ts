import type { AutomationStudioSchemaMigration } from "../../migrations/contracts/index.ts";

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
