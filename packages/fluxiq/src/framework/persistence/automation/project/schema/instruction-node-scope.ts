// 0026_relaxed_instruction_node_guard -- an instruction's node scope no longer
// depends on a `graph_nodes` row (t571).
//
// `0003` guarded `instruction_scopes.node_id` against `graph_nodes.node_id`. A
// node id is local to its Flow (every Subflow graph has its own `start`), but
// `graph_nodes` keys a node by its id alone, and a Flow's graph is imported into
// it lazily, on the first graph read or patch. So a node-scoped instruction
// naming a real node of its Flow was refused whenever that graph had not been
// imported, or another graph's node of the same id held the row; the service
// swallowed the refusal, and project SQL omitted an instruction the summary
// index listed. The save now checks the node against the Flow's documents
// (`runtime/service/flows/instruction-scope-owners.ts`), the reference the
// accepted-state contract uses (`instruction_node_missing`), and the scope row
// stores the node id without the guard. The Flow, Router and Subflow guards
// stay: those rows are written when their owners are.
//
// Its id sorts after `0026_recording_description`, the previous last of the
// project administration set, and before `0026_staged_project_snapshots_v1`,
// the first migration the stores append after that set.
import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";

export const AUTOMATION_STUDIO_PROJECT_INSTRUCTION_NODE_SCOPE_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0026_relaxed_instruction_node_guard",
  statements: [
    "drop trigger if exists fk_instruction_scopes_node_id_insert",
    "drop trigger if exists fk_instruction_scopes_node_id_update"
  ]
};
