// 0008 — compiled plan adoptions, which isolate a run from recompilation.
import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";
import { foreignKeyGuards } from "./foreign-key-guards.ts";

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
