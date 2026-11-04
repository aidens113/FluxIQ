// 0026_sa -- the project's library of parts: subflows kept past the Flow that
// built them, each version immutable, each with a card a search can read.
//
// A part is a Subflow graph saved with the Flow it came from. The library does
// not replace that Flow's own copy: it keeps a numbered, never-edited version of
// it, so a second Flow can call exactly the version it was proven against.
//
// - `project_parts`: one row per part, which version is the newest.
// - `project_part_versions`: the card (without trust, which is derived when it
//   is read, never stored) and the snapshot object holding the graph and its
//   start and end checks. Update and delete are refused by triggers: a repair
//   makes the next version and never edits one.
// - `project_part_version_sources`: every graph a version came from. A save of the
//   same shape from another Flow's copy, or from the applied copy of a part first
//   saved from a draft, adds its graph here and writes no version, so the judged runs of
//   every copy reach the version's trust. Add-only.
// - `project_part_facets`: the exact filters, one row per site, input, output
//   and lasting class of a version.
// - `part_calls`: which caller (a part version or a Flow's graph) calls which
//   version, at which node. A Flow's graph is held by its own id, and by the id of
//   the Flow it belongs to (`caller_flow_id`), which is the Flow a person opened.
// - `project_part_runs`: what each run of a version came to. Written by the
//   runner, later.
// - `project_parts_fts`: words a person can search -- name, purpose, port names.
//   The newest version of a part is the one indexed. Never a fixed value, a
//   target or anything off a page.
//
// **Why the id reads `0026_sa`.** The stores append their own migrations after the
// administration set (`0026_staged_project_snapshots_v1` through
// `0036_object_pending_removal_paths`), and the runner needs each set's ids
// ascending. A migration of this set therefore has to sort before the first of
// those, as `0026_responded_turn_decision` does: after it, before `0026_staged`.
import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";

export const AUTOMATION_STUDIO_PROJECT_PARTS_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0026_sa_project_parts",
  statements: [
    `create table project_parts (
      part_id text primary key,
      latest_version integer not null check (latest_version > 0),
      source_flow_id text not null,
      source_subflow_id text not null,
      created_at_ms integer not null,
      updated_at_ms integer not null
    )`,
    "create index project_parts_source_idx on project_parts (source_flow_id, source_subflow_id)",
    "create index project_parts_updated_idx on project_parts (updated_at_ms desc, part_id)",
    `create table project_part_versions (
      part_id text not null,
      version integer not null check (version > 0),
      card_json text not null,
      shape_hash text not null,
      snapshot_object_id text not null,
      source_graph_flow_id text not null,
      source_graph_revision integer check (source_graph_revision is null or source_graph_revision > 0),
      created_at_ms integer not null,
      primary key (part_id, version)
    )`,
    "create index project_part_versions_shape_idx on project_part_versions (shape_hash, part_id, version)",
    "create index project_part_versions_graph_idx on project_part_versions (source_graph_flow_id, source_graph_revision)",
    `create trigger project_part_versions_no_update before update on project_part_versions begin
      select raise(abort, 'A part version is immutable.');
    end`,
    `create trigger project_part_versions_no_delete before delete on project_part_versions begin
      select raise(abort, 'A part version is immutable.');
    end`,
    `create table project_part_version_sources (
      part_id text not null,
      version integer not null,
      graph_flow_id text not null,
      revision integer check (revision is null or revision > 0)
    )`,
    "create unique index project_part_version_sources_unique_idx on project_part_version_sources (part_id, version, graph_flow_id, ifnull(revision, 0))",
    "create index project_part_version_sources_graph_idx on project_part_version_sources (graph_flow_id, revision)",
    `create table project_part_facets (
      part_id text not null,
      version integer not null,
      facet text not null check (facet in ('site', 'input', 'output', 'lasting')),
      value text not null,
      primary key (part_id, version, facet, value)
    )`,
    "create index project_part_facets_lookup_idx on project_part_facets (facet, value, part_id, version)",
    `create table part_calls (
      caller_kind text not null check (caller_kind in ('part_version', 'flow_graph')),
      caller_id text not null,
      caller_version integer not null default 0,
      caller_node_id text not null,
      caller_flow_id text,
      part_id text not null,
      version integer not null check (version > 0),
      primary key (caller_kind, caller_id, caller_version, caller_node_id)
    )`,
    "create index part_calls_callee_idx on part_calls (part_id, version, caller_kind, caller_id)",
    "create index part_calls_caller_flow_idx on part_calls (caller_flow_id, part_id)",
    `create table project_part_runs (
      part_id text not null,
      version integer not null,
      run_id text not null,
      outcome text not null check (outcome in ('succeeded', 'failed', 'stopped')),
      model_calls integer not null check (model_calls >= 0),
      finished_at_ms integer not null,
      primary key (part_id, version, run_id)
    )`,
    "create index project_part_runs_version_idx on project_part_runs (part_id, version, finished_at_ms)",
    "create virtual table project_parts_fts using fts5(part_id unindexed, version unindexed, name, purpose, ports)"
  ]
};
