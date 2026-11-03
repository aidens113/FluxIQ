import type { AutomationStudioSchemaMigration } from "../../migrations/contracts/index.ts";

export const AUTOMATION_STUDIO_PROJECT_REUSABLE_LLM_CONTEXT_VALIDATION_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0018_reusable_llm_context_validation",
  statements: [
    "alter table reusable_llm_contexts add column validation_state text not null default 'unknown' check (validation_state in ('unknown', 'validated', 'applied'))",
    "create index reusable_llm_context_validation_idx on reusable_llm_contexts (validation_state, outcome, reviewer_state, created_at_ms desc, record_id)"
  ]
};
