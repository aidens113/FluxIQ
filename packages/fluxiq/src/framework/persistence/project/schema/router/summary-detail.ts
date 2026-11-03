import type { AutomationStudioSchemaMigration } from "../../migrations/contracts/index.ts";

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
