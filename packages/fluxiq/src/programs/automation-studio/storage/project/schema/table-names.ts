// The table-name catalogues callers use to assert or sweep the schema.

export const AUTOMATION_STUDIO_PROJECT_DOMAIN_TABLES = [
  "hierarchy_entries",
  "workspace_preferences",
  "flows",
  "flow_settings",
  "flow_ports",
  "flow_variables",
  "flow_errors",
  "graph_partitions",
  "graph_nodes",
  "graph_edges",
  "flow_regions",
  "flow_region_handoffs",
  "graph_revisions",
  "graph_operations",
  "subflows",
  "subflow_categories",
  "routers",
  "router_groups",
  "router_routes",
  "instructions",
  "instruction_scopes",
  "instruction_tags",
  "instruction_bindings",
  "effective_instruction_cache",
  "runtime_runs",
  "runtime_action_summaries",
  "runtime_event_chunks",
  "recordings",
  "recording_event_chunks",
  "state_snapshots",
  "state_paths",
  "adaptations",
  "adaptation_evidence",
  "adaptation_artifacts",
  "adaptation_audit_events",
  "flow_publications",
  "compiled_artifacts",
  "compiled_plan_adoptions",
  "objects",
  "object_references",
  "reusable_llm_contexts",
  "reusable_llm_context_audit_events"
] as const;

export const AUTOMATION_STUDIO_PROJECT_SEARCH_TABLES = ["hierarchy_entries_fts", "graph_nodes_fts", "instructions_fts", "graph_node_bounds", "graph_node_bounds_map"] as const;

export const AUTOMATION_STUDIO_PROJECT_MUTATION_TABLES = ["mutation_records", "mutation_touched_entities"] as const;

export const AUTOMATION_STUDIO_PROJECT_STREAM_SPOOL_TABLES = ["event_writer_leases", "event_spools"] as const;
