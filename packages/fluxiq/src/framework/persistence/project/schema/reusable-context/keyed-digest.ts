import type { AutomationStudioSchemaMigration } from "../../migrations/contracts/index.ts";

// 0035 (t745) — the key a content digest was made under. Null keeps the plain
// SHA-256 older code wrote; a protected store writes keyed digests and rekeys
// the rest when it opens. The partial index serves the rekey's pass over rows
// under a retired key (t745 u5).
export const AUTOMATION_STUDIO_PROJECT_REUSABLE_LLM_CONTEXT_KEYED_DIGEST_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0035_reusable_llm_context_keyed_digest",
  statements: [
    "alter table reusable_llm_contexts add column content_digest_key_id text",
    "create index reusable_llm_context_digest_key_idx on reusable_llm_contexts (content_digest_key_id) where content_digest_key_id is not null"
  ]
};
