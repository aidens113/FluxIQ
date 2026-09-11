// 0011-0013 — router groups and routes at scale, plus the runtime action
// summary table the router pages read from.
import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";

export const AUTOMATION_STUDIO_PROJECT_ROUTER_RUNTIME_SCALING_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0011_router_runtime_scaling",
  statements: [
    "create index if not exists subflows_target_lookup_idx on subflows (parent_flow_id, status, name collate nocase, subflow_id)",
    "create index if not exists router_routes_page_idx on router_routes (router_id, group_id, enabled, priority, route_id)",
    `create table if not exists runtime_action_summaries (
      run_id text not null,
      sequence integer not null check (sequence > 0),
      attempt_id text not null,
      node_id text not null,
      status text not null,
      started_at_ms integer not null,
      finished_at_ms integer,
      duration_ms integer,
      evidence_count integer not null default 0 check (evidence_count >= 0),
      error_summary text,
      detail_json text not null,
      primary key (run_id, sequence),
      unique (run_id, attempt_id)
    )`,
    "create index if not exists runtime_action_summaries_page_idx on runtime_action_summaries (run_id, sequence, attempt_id)",
    "create index if not exists runtime_action_summaries_status_idx on runtime_action_summaries (run_id, status, sequence, attempt_id)"
  ]
};

export const AUTOMATION_STUDIO_PROJECT_ROUTER_RUNTIME_SUMMARY_DETAIL_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0012_router_runtime_summary_details",
  statements: [
    "alter table router_groups add column description text not null default ''",
    "alter table router_groups add column order_value integer not null default 0",
    "alter table router_groups add column status text not null default 'active'",
    "alter table router_groups add column collapsed integer not null default 0",
    "alter table router_groups add column created_at_ms integer not null default 0",
    "alter table router_groups add column updated_at_ms integer not null default 0",
    "alter table router_groups add column metadata_json text not null default '{}'",
    "create index if not exists router_groups_order_idx on router_groups (router_id, order_value, group_id)",
    "alter table runtime_action_summaries add column definition_id text not null default 'unknown'",
    "alter table runtime_action_summaries add column route text",
    "alter table runtime_action_summaries add column comparison_status text",
    "alter table runtime_action_summaries add column message_summary text"
  ]
};

export const AUTOMATION_STUDIO_PROJECT_ROUTER_TARGET_REFERENCE_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0013_router_target_reference_index",
  statements: [
    "create index if not exists router_routes_target_page_idx on router_routes (router_id, target_kind, target_subflow_id, priority, route_id)"
  ]
};
