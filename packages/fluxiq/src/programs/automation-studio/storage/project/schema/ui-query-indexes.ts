// 0009 (fast UI queries) — covering indexes for the list and detail reads the
// Studio UI issues most often.
import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";

export const AUTOMATION_STUDIO_PROJECT_FAST_UI_QUERY_INDEX_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0009_fast_ui_query_indexes",
  statements: [
    "create index runtime_runs_updated_idx on runtime_runs (updated_at_ms desc, run_id desc)",
    "create index runtime_runs_flow_updated_idx on runtime_runs (flow_id, updated_at_ms desc, run_id desc)",
    "create index runtime_runs_status_updated_idx on runtime_runs (status, updated_at_ms desc, run_id desc)",
    "create index subflows_parent_updated_idx on subflows (parent_flow_id, deleted_at_ms, updated_at_ms desc, subflow_id desc)",
    "create index subflows_parent_name_idx on subflows (parent_flow_id, deleted_at_ms, name collate nocase, subflow_id)",
    "create index subflows_category_updated_idx on subflows (parent_category_id, deleted_at_ms, updated_at_ms desc, subflow_id desc)",
    "create index graph_nodes_flow_idx on graph_nodes (flow_id, deleted_at_ms, node_id)",
    "create index graph_edges_flow_idx on graph_edges (flow_id, deleted_at_ms, edge_id)",
    "create index graph_partitions_flow_bounds_idx on graph_partitions (flow_id, min_x, max_x, min_y, max_y, grid_x, grid_y)",
    "create index instruction_scopes_instruction_idx on instruction_scopes (instruction_id, scope_kind, flow_id, subflow_id, router_id, node_id)",
    "create index instruction_scopes_flow_idx on instruction_scopes (flow_id, instruction_id)",
    "create index instruction_scopes_subflow_idx on instruction_scopes (subflow_id, instruction_id)",
    "create index instructions_priority_updated_idx on instructions (deleted_at_ms, status, priority desc, updated_at_ms desc, instruction_id desc)",
    "create index instructions_updated_idx on instructions (deleted_at_ms, updated_at_ms desc, instruction_id desc)"
  ]
};
