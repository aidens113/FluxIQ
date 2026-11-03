import type { AutomationStudioSchemaMigration } from "../../migrations/contracts/index.ts";

export const AUTOMATION_STUDIO_PROJECT_ROUTER_TARGET_REFERENCE_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0013_router_target_reference_index",
  statements: [
    "create index if not exists router_routes_target_page_idx on router_routes (router_id, target_kind, target_subflow_id, priority, route_id)"
  ]
};
