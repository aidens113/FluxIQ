import type { AutomationStudioSchemaMigration } from "../../migrations/contracts/index.ts";

export const AUTOMATION_STUDIO_PROJECT_CONVERSATION_TURN_DECISION_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0026_responded_turn_decision",
  statements: ["alter table conversation_turns add column decision_kind text check (decision_kind is null or decision_kind in ('reply', 'clarify', 'invoke'))"]
};
