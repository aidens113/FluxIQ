import type { AutomationStudioSchemaMigration } from "../../migrations/contracts/index.ts";

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
