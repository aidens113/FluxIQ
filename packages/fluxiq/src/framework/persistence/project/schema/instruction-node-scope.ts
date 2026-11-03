import type { AutomationStudioSchemaMigration } from "../migrations/contracts/index.ts";

export const AUTOMATION_STUDIO_PROJECT_INSTRUCTION_NODE_SCOPE_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0026_relaxed_instruction_node_guard",
  statements: [
    "drop trigger if exists fk_instruction_scopes_node_id_insert",
    "drop trigger if exists fk_instruction_scopes_node_id_update"
  ]
};
