// 0014 — the canonical intervention mode carried on flow settings.
import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";

export const AUTOMATION_STUDIO_PROJECT_INTERVENTION_MODE_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0014_canonical_intervention_mode",
  statements: [
    "alter table flow_settings add column intervention_mode text check (intervention_mode is null or intervention_mode in ('fully_adaptive', 'manual_approval', 'no_llm_intervention'))",
    "alter table flow_settings add column intervention_mode_version integer not null default 0 check (intervention_mode_version >= 0)",
    "create index if not exists flow_settings_intervention_mode_idx on flow_settings (intervention_mode, updated_at_ms desc, flow_id)"
  ]
};
