import type { AutomationStudioSchemaMigration } from "./schema-migrations.ts";

export const AUTOMATION_STUDIO_PROJECT_DOMAIN_RESOURCE_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0002_domain_resource_tables",
  statements: [
    `create table hierarchy_entries (
      entry_id text primary key,
      parent_entry_id text,
      kind text not null,
      owner_id text not null,
      display_name text not null,
      sort_key text not null default '',
      depth integer not null default 0 check (depth >= 0),
      path_key text not null,
      is_system integer not null default 0 check (is_system in (0, 1)),
      is_deleted integer not null default 0 check (is_deleted in (0, 1)),
      revision integer not null default 1 check (revision > 0),
      created_at_ms integer not null,
      updated_at_ms integer not null
    )`,
    `create table workspace_preferences (
      user_id text not null,
      preference_key text not null,
      value_json text not null,
      revision integer not null default 1 check (revision > 0),
      updated_at_ms integer not null,
      primary key (user_id, preference_key)
    )`,
    `create table flows (
      flow_id text primary key,
      parent_flow_id text,
      owning_subflow_id text,
      name text not null,
      description text not null default '',
      scope_kind text not null,
      scope_id text,
      visibility text not null default 'private' check (visibility in ('private', 'project', 'domain', 'global')),
      origin text not null default 'user' check (origin in ('user', 'recording', 'adaptation', 'import', 'system')),
      source_mode text not null default 'visual' check (source_mode in ('visual', 'code', 'hybrid')),
      status text not null default 'draft' check (status in ('draft', 'active', 'archived', 'deleted')),
      graph_revision integer not null default 1 check (graph_revision > 0),
      settings_revision integer not null default 1 check (settings_revision > 0),
      compiled_revision integer check (compiled_revision is null or compiled_revision > 0),
      created_at_ms integer not null,
      updated_at_ms integer not null,
      deleted_at_ms integer
    )`,
    `create table flow_settings (
      flow_id text primary key,
      execution_defaults_json text not null,
      training_json text not null,
      adaptation_json text not null,
      llm_json text not null,
      safety_json text not null,
      revision integer not null default 1 check (revision > 0),
      updated_at_ms integer not null
    )`,
    `create table flow_ports (
      port_id text primary key,
      flow_id text not null,
      direction text not null check (direction in ('input', 'output')),
      name text not null,
      value_type text not null,
      required integer not null default 0 check (required in (0, 1)),
      default_value_json text,
      description text not null default '',
      sort_key text not null default '',
      revision integer not null default 1 check (revision > 0)
    )`,
    `create table flow_variables (
      variable_id text primary key,
      flow_id text not null,
      name text not null,
      value_type text not null,
      initial_value_json text,
      description text not null default '',
      sort_key text not null default '',
      revision integer not null default 1 check (revision > 0)
    )`,
    `create table flow_errors (
      error_id text primary key,
      flow_id text not null,
      code text not null,
      description text not null default '',
      metadata_json text not null default '{}',
      revision integer not null default 1 check (revision > 0)
    )`,
    `create table graph_partitions (
      partition_id text primary key,
      flow_id text not null,
      grid_x integer not null,
      grid_y integer not null,
      min_x real not null,
      min_y real not null,
      max_x real not null,
      max_y real not null,
      node_count integer not null default 0 check (node_count >= 0),
      edge_count integer not null default 0 check (edge_count >= 0),
      revision integer not null default 1 check (revision > 0),
      updated_at_ms integer not null
    )`,
    `create table graph_nodes (
      node_id text primary key,
      flow_id text not null,
      partition_id text,
      definition_id text not null,
      definition_version text not null,
      label text not null,
      description text not null default '',
      x real not null,
      y real not null,
      width real not null check (width >= 0),
      height real not null check (height >= 0),
      z_index integer not null default 0,
      disabled integer not null default 0 check (disabled in (0, 1)),
      parameter_values_json text not null default '{}',
      metadata_json text not null default '{}',
      revision integer not null default 1 check (revision > 0),
      created_at_ms integer not null,
      updated_at_ms integer not null,
      deleted_at_ms integer
    )`,
    `create table graph_edges (
      edge_id text primary key,
      flow_id text not null,
      source_node_id text not null,
      target_node_id text not null,
      source_port_id text,
      target_port_id text,
      label text not null default '',
      metadata_json text not null default '{}',
      revision integer not null default 1 check (revision > 0),
      created_at_ms integer not null,
      updated_at_ms integer not null,
      deleted_at_ms integer
    )`,
    `create table flow_regions (
      region_id text primary key,
      flow_id text not null,
      partition_id text,
      name text not null,
      kind text not null,
      bounds_json text not null,
      metadata_json text not null default '{}',
      revision integer not null default 1 check (revision > 0)
    )`,
    `create table flow_region_handoffs (
      handoff_id text primary key,
      flow_id text not null,
      from_region_id text not null,
      to_region_id text not null,
      contract_json text not null,
      revision integer not null default 1 check (revision > 0)
    )`,
    `create table graph_revisions (
      revision_id text primary key,
      flow_id text not null,
      revision_number integer not null check (revision_number > 0),
      parent_revision integer,
      author_id text,
      source text not null,
      operation_count integer not null default 0 check (operation_count >= 0),
      snapshot_object_id text,
      digest text not null,
      message text not null default '',
      created_at_ms integer not null
    )`,
    `create table graph_operations (
      operation_id text primary key,
      revision_id text not null,
      ordinal integer not null check (ordinal >= 0),
      operation_kind text not null,
      entity_kind text not null,
      entity_id text not null,
      before_json text,
      after_json text
    )`,
    `create table subflows (
      subflow_id text primary key,
      parent_flow_id text not null,
      graph_flow_id text not null,
      parent_category_id text,
      name text not null,
      description text not null default '',
      role text not null default '',
      status text not null default 'draft' check (status in ('draft', 'active', 'archived', 'deleted')),
      input_mapping_json text not null default '[]',
      output_mapping_json text not null default '[]',
      approval_override text check (approval_override is null or approval_override in ('adaptive', 'manual_approval', 'disabled')),
      revision integer not null default 1 check (revision > 0),
      created_at_ms integer not null,
      updated_at_ms integer not null,
      deleted_at_ms integer
    )`,
    `create table subflow_categories (
      category_id text primary key,
      flow_id text not null,
      parent_category_id text,
      name text not null,
      sort_key text not null default '',
      revision integer not null default 1 check (revision > 0),
      created_at_ms integer not null,
      updated_at_ms integer not null
    )`,
    `create table routers (
      router_id text primary key,
      flow_id text not null,
      fallback_kind text not null default 'none' check (fallback_kind in ('none', 'subflow', 'error')),
      fallback_subflow_id text,
      revision integer not null default 1 check (revision > 0),
      created_at_ms integer not null,
      updated_at_ms integer not null
    )`,
    `create table router_groups (
      group_id text primary key,
      router_id text not null,
      name text not null,
      sort_key text not null default '',
      revision integer not null default 1 check (revision > 0)
    )`,
    `create table router_routes (
      route_id text primary key,
      router_id text not null,
      group_id text,
      name text not null,
      priority integer not null default 0,
      enabled integer not null default 1 check (enabled in (0, 1)),
      condition_kind text not null,
      condition_json text not null,
      target_kind text not null check (target_kind in ('subflow', 'flow', 'error', 'none')),
      target_subflow_id text,
      revision integer not null default 1 check (revision > 0),
      created_at_ms integer not null,
      updated_at_ms integer not null
    )`,
    `create table instructions (
      instruction_id text primary key,
      title text not null,
      body_object_id text,
      inline_body text,
      requirement text not null default 'guidance' check (requirement in ('guidance', 'required', 'forbidden')),
      status text not null default 'active' check (status in ('draft', 'active', 'archived', 'deleted')),
      priority integer not null default 0,
      content_digest text not null,
      revision integer not null default 1 check (revision > 0),
      created_at_ms integer not null,
      updated_at_ms integer not null,
      deleted_at_ms integer
    )`,
    `create table instruction_scopes (
      instruction_id text not null,
      scope_kind text not null check (scope_kind in ('global', 'project', 'flow', 'router', 'subflow', 'node', 'error')),
      project_id text,
      flow_id text,
      router_id text,
      subflow_id text,
      node_id text,
      error_code text
    )`,
    `create table instruction_tags (
      instruction_id text not null,
      tag text not null,
      primary key (instruction_id, tag)
    )`,
    `create table instruction_bindings (
      binding_id text primary key,
      owner_kind text not null,
      owner_id text not null,
      instruction_id text not null,
      sort_key text not null default '',
      enabled integer not null default 1 check (enabled in (0, 1)),
      revision integer not null default 1 check (revision > 0)
    )`,
    `create table effective_instruction_cache (
      scope_digest text primary key,
      instruction_revision integer not null check (instruction_revision > 0),
      object_id text not null,
      created_at_ms integer not null
    )`,
    `create table runtime_runs (
      run_id text primary key,
      flow_id text not null,
      flow_revision integer not null check (flow_revision > 0),
      compiled_artifact_id text,
      status text not null check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
      trigger_kind text not null,
      queued_at_ms integer not null,
      started_at_ms integer,
      finished_at_ms integer,
      action_count integer not null default 0 check (action_count >= 0),
      effect_count integer not null default 0 check (effect_count >= 0),
      error_count integer not null default 0 check (error_count >= 0),
      adaptation_count integer not null default 0 check (adaptation_count >= 0),
      last_event_sequence integer not null default 0 check (last_event_sequence >= 0),
      input_object_id text,
      output_object_id text,
      error_object_id text,
      updated_at_ms integer not null
    )`,
    `create table runtime_event_chunks (
      chunk_id text primary key,
      run_id text not null,
      first_sequence integer not null check (first_sequence >= 0),
      last_sequence integer not null check (last_sequence >= first_sequence),
      event_count integer not null check (event_count >= 0),
      byte_count integer not null check (byte_count >= 0),
      object_id text not null,
      sha256 text not null,
      closed integer not null default 0 check (closed in (0, 1)),
      created_at_ms integer not null
    )`,
    `create table recordings (
      recording_id text primary key,
      name text not null,
      task_id text,
      domain_id text,
      status text not null check (status in ('recording', 'completed', 'failed', 'cancelled')),
      started_at_ms integer not null,
      ended_at_ms integer,
      event_count integer not null default 0 check (event_count >= 0),
      action_count integer not null default 0 check (action_count >= 0),
      state_snapshot_count integer not null default 0 check (state_snapshot_count >= 0),
      thumbnail_object_id text,
      updated_at_ms integer not null
    )`,
    `create table recording_event_chunks (
      chunk_id text primary key,
      recording_id text not null,
      first_sequence integer not null check (first_sequence >= 0),
      last_sequence integer not null check (last_sequence >= first_sequence),
      event_count integer not null check (event_count >= 0),
      byte_count integer not null check (byte_count >= 0),
      object_id text not null,
      sha256 text not null,
      closed integer not null default 0 check (closed in (0, 1)),
      created_at_ms integer not null
    )`,
    `create table state_snapshots (
      snapshot_id text primary key,
      source_kind text not null,
      source_id text not null,
      sequence integer not null check (sequence >= 0),
      captured_at_ms integer not null,
      state_object_id text,
      screenshot_object_id text,
      previous_snapshot_id text,
      digest text not null,
      metadata_json text not null default '{}'
    )`,
    `create table state_paths (
      snapshot_id text not null,
      namespace text not null,
      path text not null,
      value_type text not null,
      scalar_text text,
      scalar_number real,
      scalar_boolean integer check (scalar_boolean is null or scalar_boolean in (0, 1)),
      value_object_id text,
      primary key (snapshot_id, namespace, path)
    )`,
    `create table adaptations (
      adaptation_id text primary key,
      flow_id text not null,
      subflow_id text,
      base_revision integer not null check (base_revision > 0),
      proposed_revision integer not null check (proposed_revision > 0),
      trigger text not null,
      status text not null check (status in ('draft', 'pending_approval', 'approved', 'applied', 'rejected', 'failed')),
      risk_level text not null check (risk_level in ('low', 'medium', 'high')),
      approval_mode text not null check (approval_mode in ('adaptive', 'manual_approval', 'disabled')),
      patch_object_id text not null,
      evidence_object_id text,
      created_at_ms integer not null,
      updated_at_ms integer not null,
      reviewed_at_ms integer,
      applied_at_ms integer
    )`,
    `create table adaptation_evidence (
      adaptation_id text not null,
      evidence_kind text not null,
      evidence_id text not null,
      sequence integer not null default 0,
      primary key (adaptation_id, evidence_kind, evidence_id)
    )`,
    `create table flow_publications (
      publication_id text primary key,
      flow_id text not null,
      version text not null,
      flow_revision integer not null check (flow_revision > 0),
      compiled_artifact_id text,
      digest text not null,
      status text not null check (status in ('draft', 'published', 'deprecated')),
      changelog text not null default '',
      published_at_ms integer,
      deprecated_at_ms integer
    )`,
    `create table compiled_artifacts (
      artifact_id text primary key,
      flow_id text not null,
      flow_revision integer not null check (flow_revision > 0),
      compiler_version text not null,
      object_id text not null,
      digest text not null,
      status text not null check (status in ('pending', 'ready', 'failed')),
      created_at_ms integer not null
    )`,
    `create table objects (
      object_id text primary key,
      sha256 text not null,
      media_type text not null,
      byte_count integer not null check (byte_count >= 0),
      relative_path text not null,
      compression text,
      encryption text,
      created_at_ms integer not null,
      verified_at_ms integer
    )`,
    `create table object_references (
      reference_id text primary key,
      object_id text not null,
      owner_kind text not null,
      owner_id text not null,
      purpose text not null,
      created_at_ms integer not null
    )`
  ]
};

export const AUTOMATION_STUDIO_PROJECT_RELATION_INDEX_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0003_relation_indexes_search",
  statements: [
    "create unique index graph_partitions_flow_grid_uq on graph_partitions (flow_id, grid_x, grid_y)",
    "create unique index graph_revisions_flow_revision_uq on graph_revisions (flow_id, revision_number)",
    "create unique index graph_operations_revision_ordinal_uq on graph_operations (revision_id, ordinal)",
    "create unique index subflows_graph_flow_uq on subflows (graph_flow_id)",
    "create unique index routers_flow_uq on routers (flow_id)",
    "create unique index runtime_event_chunks_run_first_uq on runtime_event_chunks (run_id, first_sequence)",
    "create unique index recording_event_chunks_recording_first_uq on recording_event_chunks (recording_id, first_sequence)",
    "create unique index objects_sha256_uq on objects (sha256)",
    "create unique index object_references_owner_uq on object_references (object_id, owner_kind, owner_id, purpose)",
    "create unique index flow_publications_flow_version_uq on flow_publications (flow_id, version)",
    "create unique index compiled_artifacts_flow_revision_compiler_uq on compiled_artifacts (flow_id, flow_revision, compiler_version)",
    "create unique index flow_ports_flow_direction_name_uq on flow_ports (flow_id, direction, name)",
    "create unique index flow_variables_flow_name_uq on flow_variables (flow_id, name)",
    "create unique index flow_errors_flow_code_uq on flow_errors (flow_id, code)",
    "create index hierarchy_entries_children_idx on hierarchy_entries (parent_entry_id, is_deleted, sort_key, entry_id)",
    "create index hierarchy_entries_owner_idx on hierarchy_entries (owner_id, kind)",
    "create index hierarchy_entries_path_idx on hierarchy_entries (path_key)",
    "create index flows_parent_status_idx on flows (parent_flow_id, status, updated_at_ms desc, flow_id)",
    "create index flows_updated_idx on flows (updated_at_ms desc, flow_id desc)",
    "create index graph_nodes_partition_idx on graph_nodes (flow_id, partition_id, deleted_at_ms, node_id)",
    "create index graph_nodes_definition_idx on graph_nodes (flow_id, definition_id, deleted_at_ms, node_id)",
    "create index graph_edges_source_idx on graph_edges (flow_id, source_node_id, deleted_at_ms, edge_id)",
    "create index graph_edges_target_idx on graph_edges (flow_id, target_node_id, deleted_at_ms, edge_id)",
    "create index graph_operations_entity_idx on graph_operations (entity_kind, entity_id, revision_id)",
    "create index subflows_parent_status_name_idx on subflows (parent_flow_id, status, name collate nocase, subflow_id)",
    "create index subflows_category_idx on subflows (parent_category_id, status, name collate nocase, subflow_id)",
    "create index subflow_categories_children_idx on subflow_categories (flow_id, parent_category_id, sort_key, category_id)",
    "create index router_routes_priority_idx on router_routes (router_id, enabled, priority desc, route_id)",
    "create index instruction_scopes_lookup_idx on instruction_scopes (scope_kind, project_id, flow_id, router_id, subflow_id, node_id, error_code)",
    "create index instruction_bindings_owner_idx on instruction_bindings (owner_kind, owner_id, enabled, sort_key, binding_id)",
    "create index runtime_runs_started_idx on runtime_runs (started_at_ms desc, run_id desc)",
    "create index runtime_runs_flow_status_idx on runtime_runs (flow_id, status, started_at_ms desc, run_id desc)",
    "create index runtime_event_chunks_sequence_idx on runtime_event_chunks (run_id, first_sequence, last_sequence)",
    "create index recordings_time_idx on recordings (started_at_ms desc, recording_id desc)",
    "create index recording_event_chunks_sequence_idx on recording_event_chunks (recording_id, first_sequence, last_sequence)",
    "create index state_snapshots_source_idx on state_snapshots (source_kind, source_id, sequence)",
    "create index state_paths_lookup_idx on state_paths (namespace, path, value_type)",
    "create index adaptations_flow_status_idx on adaptations (flow_id, status, updated_at_ms desc, adaptation_id)",
    "create index adaptations_subflow_status_idx on adaptations (subflow_id, status, updated_at_ms desc, adaptation_id)",
    "create index object_references_owner_idx on object_references (owner_kind, owner_id, purpose)",
    "create virtual table hierarchy_entries_fts using fts5(entry_id unindexed, display_name)",
    "create virtual table graph_nodes_fts using fts5(node_id unindexed, flow_id unindexed, label, description)",
    "create virtual table instructions_fts using fts5(instruction_id unindexed, title, inline_body)",
    "create virtual table graph_node_bounds using rtree(bounds_id, min_x, max_x, min_y, max_y)",
    "create table graph_node_bounds_map (bounds_id integer primary key, node_id text not null unique)",
    `create trigger graph_nodes_bounds_ai after insert on graph_nodes when new.deleted_at_ms is null begin
      insert into graph_node_bounds_map (bounds_id, node_id) values (new.rowid, new.node_id);
      insert into graph_node_bounds (bounds_id, min_x, max_x, min_y, max_y) values (new.rowid, new.x, new.x + new.width, new.y, new.y + new.height);
    end`,
    `create trigger graph_nodes_bounds_ad after delete on graph_nodes begin
      delete from graph_node_bounds where bounds_id = old.rowid;
      delete from graph_node_bounds_map where bounds_id = old.rowid;
    end`,
    `create trigger graph_nodes_bounds_au_clear after update on graph_nodes begin
      delete from graph_node_bounds where bounds_id = old.rowid;
      delete from graph_node_bounds_map where bounds_id = old.rowid;
    end`,
    `create trigger graph_nodes_bounds_au_insert after update on graph_nodes when new.deleted_at_ms is null begin
      insert into graph_node_bounds_map (bounds_id, node_id) values (new.rowid, new.node_id);
      insert into graph_node_bounds (bounds_id, min_x, max_x, min_y, max_y) values (new.rowid, new.x, new.x + new.width, new.y, new.y + new.height);
    end`,
    ...foreignKeyGuards("flows", "parent_flow_id", "flows", "flow_id"),
    ...foreignKeyGuards("flows", "owning_subflow_id", "subflows", "subflow_id"),
    ...foreignKeyGuards("flow_settings", "flow_id", "flows", "flow_id", false),
    ...foreignKeyGuards("flow_ports", "flow_id", "flows", "flow_id", false),
    ...foreignKeyGuards("flow_variables", "flow_id", "flows", "flow_id", false),
    ...foreignKeyGuards("flow_errors", "flow_id", "flows", "flow_id", false),
    ...foreignKeyGuards("graph_partitions", "flow_id", "flows", "flow_id", false),
    ...foreignKeyGuards("graph_nodes", "flow_id", "flows", "flow_id", false),
    ...foreignKeyGuards("graph_nodes", "partition_id", "graph_partitions", "partition_id"),
    ...foreignKeyGuards("graph_edges", "flow_id", "flows", "flow_id", false),
    ...foreignKeyGuards("graph_edges", "source_node_id", "graph_nodes", "node_id", false),
    ...foreignKeyGuards("graph_edges", "target_node_id", "graph_nodes", "node_id", false),
    ...foreignKeyGuards("flow_regions", "flow_id", "flows", "flow_id", false),
    ...foreignKeyGuards("flow_regions", "partition_id", "graph_partitions", "partition_id"),
    ...foreignKeyGuards("flow_region_handoffs", "flow_id", "flows", "flow_id", false),
    ...foreignKeyGuards("flow_region_handoffs", "from_region_id", "flow_regions", "region_id", false),
    ...foreignKeyGuards("flow_region_handoffs", "to_region_id", "flow_regions", "region_id", false),
    ...foreignKeyGuards("graph_revisions", "flow_id", "flows", "flow_id", false),
    ...foreignKeyGuards("graph_revisions", "snapshot_object_id", "objects", "object_id"),
    ...foreignKeyGuards("graph_operations", "revision_id", "graph_revisions", "revision_id", false),
    ...foreignKeyGuards("subflows", "parent_flow_id", "flows", "flow_id", false),
    ...foreignKeyGuards("subflows", "graph_flow_id", "flows", "flow_id", false),
    ...foreignKeyGuards("subflows", "parent_category_id", "subflow_categories", "category_id"),
    ...foreignKeyGuards("subflow_categories", "flow_id", "flows", "flow_id", false),
    ...foreignKeyGuards("subflow_categories", "parent_category_id", "subflow_categories", "category_id"),
    ...foreignKeyGuards("routers", "flow_id", "flows", "flow_id", false),
    ...foreignKeyGuards("routers", "fallback_subflow_id", "subflows", "subflow_id"),
    ...foreignKeyGuards("router_groups", "router_id", "routers", "router_id", false),
    ...foreignKeyGuards("router_routes", "router_id", "routers", "router_id", false),
    ...foreignKeyGuards("router_routes", "group_id", "router_groups", "group_id"),
    ...foreignKeyGuards("router_routes", "target_subflow_id", "subflows", "subflow_id"),
    ...foreignKeyGuards("instructions", "body_object_id", "objects", "object_id"),
    ...foreignKeyGuards("instruction_scopes", "instruction_id", "instructions", "instruction_id", false),
    ...foreignKeyGuards("instruction_scopes", "flow_id", "flows", "flow_id"),
    ...foreignKeyGuards("instruction_scopes", "router_id", "routers", "router_id"),
    ...foreignKeyGuards("instruction_scopes", "subflow_id", "subflows", "subflow_id"),
    ...foreignKeyGuards("instruction_scopes", "node_id", "graph_nodes", "node_id"),
    ...foreignKeyGuards("instruction_tags", "instruction_id", "instructions", "instruction_id", false),
    ...foreignKeyGuards("instruction_bindings", "instruction_id", "instructions", "instruction_id", false),
    ...foreignKeyGuards("effective_instruction_cache", "object_id", "objects", "object_id", false),
    ...foreignKeyGuards("runtime_runs", "flow_id", "flows", "flow_id", false),
    ...foreignKeyGuards("runtime_runs", "compiled_artifact_id", "compiled_artifacts", "artifact_id"),
    ...foreignKeyGuards("runtime_runs", "input_object_id", "objects", "object_id"),
    ...foreignKeyGuards("runtime_runs", "output_object_id", "objects", "object_id"),
    ...foreignKeyGuards("runtime_runs", "error_object_id", "objects", "object_id"),
    ...foreignKeyGuards("runtime_event_chunks", "run_id", "runtime_runs", "run_id", false),
    ...foreignKeyGuards("runtime_event_chunks", "object_id", "objects", "object_id", false),
    ...foreignKeyGuards("recordings", "thumbnail_object_id", "objects", "object_id"),
    ...foreignKeyGuards("recording_event_chunks", "recording_id", "recordings", "recording_id", false),
    ...foreignKeyGuards("recording_event_chunks", "object_id", "objects", "object_id", false),
    ...foreignKeyGuards("state_snapshots", "state_object_id", "objects", "object_id"),
    ...foreignKeyGuards("state_snapshots", "screenshot_object_id", "objects", "object_id"),
    ...foreignKeyGuards("state_snapshots", "previous_snapshot_id", "state_snapshots", "snapshot_id"),
    ...foreignKeyGuards("state_paths", "snapshot_id", "state_snapshots", "snapshot_id", false),
    ...foreignKeyGuards("state_paths", "value_object_id", "objects", "object_id"),
    ...foreignKeyGuards("adaptations", "flow_id", "flows", "flow_id", false),
    ...foreignKeyGuards("adaptations", "subflow_id", "subflows", "subflow_id"),
    ...foreignKeyGuards("adaptations", "patch_object_id", "objects", "object_id", false),
    ...foreignKeyGuards("adaptations", "evidence_object_id", "objects", "object_id"),
    ...foreignKeyGuards("adaptation_evidence", "adaptation_id", "adaptations", "adaptation_id", false),
    ...foreignKeyGuards("flow_publications", "flow_id", "flows", "flow_id", false),
    ...foreignKeyGuards("flow_publications", "compiled_artifact_id", "compiled_artifacts", "artifact_id"),
    ...foreignKeyGuards("compiled_artifacts", "flow_id", "flows", "flow_id", false),
    ...foreignKeyGuards("compiled_artifacts", "object_id", "objects", "object_id", false),
    ...foreignKeyGuards("object_references", "object_id", "objects", "object_id", false)
  ]
};

export const AUTOMATION_STUDIO_PROJECT_MUTATION_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0004_idempotent_mutations",
  statements: [
    `create table mutation_records (
      mutation_id text primary key,
      operation_kind text not null,
      owner_kind text not null,
      owner_id text not null,
      request_digest text not null,
      status text not null check (status in ('started', 'committed', 'failed')),
      response_json text,
      error_json text,
      first_change_sequence integer,
      last_change_sequence integer,
      created_at_ms integer not null,
      updated_at_ms integer not null,
      completed_at_ms integer,
      expires_at_ms integer
    )`,
    "create index mutation_records_owner_idx on mutation_records (owner_kind, owner_id, updated_at_ms desc, mutation_id)",
    "create index mutation_records_status_idx on mutation_records (status, updated_at_ms, mutation_id)",
    "create index mutation_records_expiry_idx on mutation_records (expires_at_ms, mutation_id)",
    `create table mutation_touched_entities (
      mutation_id text not null,
      entity_kind text not null,
      entity_id text not null,
      operation text not null,
      revision integer,
      primary key (mutation_id, entity_kind, entity_id)
    )`,
    "create index mutation_touched_entities_entity_idx on mutation_touched_entities (entity_kind, entity_id, mutation_id)",
    ...foreignKeyGuards("mutation_touched_entities", "mutation_id", "mutation_records", "mutation_id", false)
  ]
};

export const AUTOMATION_STUDIO_PROJECT_STREAM_SPOOL_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0005_event_stream_spools",
  statements: [
    `create table event_writer_leases (
      stream_kind text not null check (stream_kind in ('runtime', 'recording')),
      stream_id text not null,
      lease_token text not null,
      owner_id text not null,
      acquired_at_ms integer not null,
      heartbeat_at_ms integer not null,
      expires_at_ms integer not null,
      primary key (stream_kind, stream_id)
    )`,
    "create index event_writer_leases_expiry_idx on event_writer_leases (expires_at_ms, stream_kind, stream_id)",
    `create table event_spools (
      spool_id text primary key,
      stream_kind text not null check (stream_kind in ('runtime', 'recording')),
      stream_id text not null,
      lease_token text not null,
      first_sequence integer,
      last_sequence integer,
      event_count integer not null default 0 check (event_count >= 0),
      byte_count integer not null default 0 check (byte_count >= 0),
      spool_path text not null,
      status text not null check (status in ('active', 'sealed', 'recovered', 'abandoned')),
      created_at_ms integer not null,
      updated_at_ms integer not null
    )`,
    "create index event_spools_stream_status_idx on event_spools (stream_kind, stream_id, status, first_sequence)",
    "create index event_spools_status_idx on event_spools (status, updated_at_ms, spool_id)"
  ]
};

export const AUTOMATION_STUDIO_PROJECT_EVENT_CURSOR_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0006_event_chunk_time_ranges",
  statements: [
    "alter table runtime_event_chunks add column first_event_at_ms integer",
    "alter table runtime_event_chunks add column last_event_at_ms integer",
    "alter table recording_event_chunks add column first_event_at_ms integer",
    "alter table recording_event_chunks add column last_event_at_ms integer",
    "create index runtime_event_chunks_time_idx on runtime_event_chunks (run_id, last_event_at_ms, first_event_at_ms, first_sequence)",
    "create index recording_event_chunks_time_idx on recording_event_chunks (recording_id, last_event_at_ms, first_event_at_ms, first_sequence)"
  ]
};

export const AUTOMATION_STUDIO_PROJECT_RETENTION_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0007_event_retention",
  statements: [
    "alter table runtime_event_chunks add column archived_at_ms integer",
    "alter table recording_event_chunks add column archived_at_ms integer",
    "create index runtime_event_chunks_archive_idx on runtime_event_chunks (run_id, archived_at_ms, last_sequence, chunk_id)",
    "create index recording_event_chunks_archive_idx on recording_event_chunks (recording_id, archived_at_ms, last_sequence, chunk_id)"
  ]
};

export const AUTOMATION_STUDIO_PROJECT_COMPILED_RUNTIME_ISOLATION_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0008_compiled_runtime_isolation",
  statements: [
    `create table compiled_plan_adoptions (
      adoption_id text primary key,
      run_id text not null,
      from_artifact_id text not null,
      to_artifact_id text not null,
      safe_point_sequence integer not null check (safe_point_sequence >= 0),
      adaptation_id text,
      reason text not null default '',
      adopted_at_ms integer not null
    )`,
    "create index compiled_plan_adoptions_run_sequence_idx on compiled_plan_adoptions (run_id, safe_point_sequence, adoption_id)",
    "create index compiled_plan_adoptions_artifact_idx on compiled_plan_adoptions (to_artifact_id, adopted_at_ms, adoption_id)",
    ...foreignKeyGuards("compiled_plan_adoptions", "run_id", "runtime_runs", "run_id", false),
    ...foreignKeyGuards("compiled_plan_adoptions", "from_artifact_id", "compiled_artifacts", "artifact_id", false),
    ...foreignKeyGuards("compiled_plan_adoptions", "to_artifact_id", "compiled_artifacts", "artifact_id", false),
    ...foreignKeyGuards("compiled_plan_adoptions", "adaptation_id", "adaptations", "adaptation_id")
  ]
};

export const AUTOMATION_STUDIO_PROJECT_ADAPTATION_EVIDENCE_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0009_adaptation_evidence_revision_safety",
  statements: [
    "alter table adaptations add column source_run_id text",
    "alter table adaptations add column author text not null default 'runtime' check (author in ('runtime', 'llm', 'user', 'system'))",
    "alter table adaptations add column status_reason text not null default ''",
    "alter table adaptations add column status_detail_json text not null default '{}'",
    "alter table adaptations add column base_flow_revision integer check (base_flow_revision is null or base_flow_revision > 0)",
    "alter table adaptations add column base_router_revision integer check (base_router_revision is null or base_router_revision > 0)",
    "alter table adaptations add column base_settings_revision integer check (base_settings_revision is null or base_settings_revision > 0)",
    "alter table adaptations add column base_instruction_revision integer check (base_instruction_revision is null or base_instruction_revision > 0)",
    "alter table adaptations add column applied_revision integer check (applied_revision is null or applied_revision > 0)",
    "alter table adaptations add column prompt_object_id text",
    "alter table adaptations add column response_object_id text",
    "alter table adaptations add column rollback_object_id text",
    "alter table adaptations add column audit_object_id text",
    "alter table adaptations add column patch_digest text not null default ''",
    "alter table adaptations add column evidence_digest text not null default ''",
    "alter table adaptations add column superseded_by_adaptation_id text",
    `create table adaptation_artifacts (
      artifact_id text primary key,
      adaptation_id text not null,
      artifact_kind text not null check (artifact_kind in ('patch', 'prompt', 'response', 'evidence', 'validation', 'rollback', 'audit')),
      object_id text not null,
      sequence integer not null default 0 check (sequence >= 0),
      summary text not null default '',
      digest text not null,
      created_at_ms integer not null
    )`,
    `create table adaptation_audit_events (
      event_id text primary key,
      adaptation_id text not null,
      event_type text not null check (event_type in ('created', 'status_changed', 'approved', 'rejected', 'applied', 'apply_failed', 'stale_base', 'rebased', 'superseded', 'rollback', 'policy_blocked', 'validation_requested')),
      actor_id text,
      from_status text,
      to_status text,
      reason text not null default '',
      detail_object_id text,
      detail_json text not null default '{}',
      created_at_ms integer not null
    )`,
    "create index adaptations_flow_updated_idx on adaptations (flow_id, updated_at_ms desc, adaptation_id desc)",
    "create index adaptations_source_run_idx on adaptations (source_run_id, updated_at_ms desc, adaptation_id)",
    "create index adaptations_status_updated_idx on adaptations (status, updated_at_ms desc, adaptation_id desc)",
    "create index adaptation_artifacts_adaptation_kind_idx on adaptation_artifacts (adaptation_id, artifact_kind, sequence, artifact_id)",
    "create index adaptation_audit_events_adaptation_idx on adaptation_audit_events (adaptation_id, created_at_ms, event_id)",
    ...foreignKeyGuards("adaptations", "source_run_id", "runtime_runs", "run_id"),
    ...foreignKeyGuards("adaptations", "prompt_object_id", "objects", "object_id"),
    ...foreignKeyGuards("adaptations", "response_object_id", "objects", "object_id"),
    ...foreignKeyGuards("adaptations", "rollback_object_id", "objects", "object_id"),
    ...foreignKeyGuards("adaptations", "audit_object_id", "objects", "object_id"),
    ...foreignKeyGuards("adaptations", "superseded_by_adaptation_id", "adaptations", "adaptation_id"),
    ...foreignKeyGuards("adaptation_artifacts", "adaptation_id", "adaptations", "adaptation_id", false),
    ...foreignKeyGuards("adaptation_artifacts", "object_id", "objects", "object_id", false),
    ...foreignKeyGuards("adaptation_audit_events", "adaptation_id", "adaptations", "adaptation_id", false),
    ...foreignKeyGuards("adaptation_audit_events", "detail_object_id", "objects", "object_id")
  ]
};

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
  "object_references"
] as const;

export const AUTOMATION_STUDIO_PROJECT_SEARCH_TABLES = ["hierarchy_entries_fts", "graph_nodes_fts", "instructions_fts", "graph_node_bounds", "graph_node_bounds_map"] as const;

export const AUTOMATION_STUDIO_PROJECT_MUTATION_TABLES = ["mutation_records", "mutation_touched_entities"] as const;
export const AUTOMATION_STUDIO_PROJECT_STREAM_SPOOL_TABLES = ["event_writer_leases", "event_spools"] as const;

function foreignKeyGuards(sourceTable: string, sourceColumn: string, targetTable: string, targetColumn: string, nullable = true): string[] {
  const triggerPrefix = `fk_${sourceTable}_${sourceColumn}`.replace(/[^A-Za-z0-9_]/g, "_");
  const missingPredicate = `${nullable ? `new.${sourceColumn} is not null and ` : ""}not exists (select 1 from ${targetTable} where ${targetColumn} = new.${sourceColumn})`;
  return [
    `create trigger ${triggerPrefix}_insert before insert on ${sourceTable} when ${missingPredicate} begin
      select raise(abort, '${sourceTable}.${sourceColumn} references missing ${targetTable}.${targetColumn}');
    end`,
    `create trigger ${triggerPrefix}_update before update of ${sourceColumn} on ${sourceTable} when ${missingPredicate} begin
      select raise(abort, '${sourceTable}.${sourceColumn} references missing ${targetTable}.${targetColumn}');
    end`
  ];
}
