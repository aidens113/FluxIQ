import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";

export const AUTOMATION_STUDIO_STAGED_PROJECT_AUTHORITY_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0026_staged_project_snapshots_v1",
  statements: [
    "create table if not exists accepted_project_snapshots (project_id text not null, epoch text not null, generation integer not null check (generation > 0), payload_kind text not null check (payload_kind in ('state','tombstone')), payload_json text not null, digest text not null, created_at_ms integer not null, primary key (project_id, epoch, generation), unique (project_id, epoch, generation, digest))",
    "create table if not exists accepted_project_heads (project_id text primary key, epoch text not null, generation integer not null check (generation > 0), digest text not null, state text not null check (state in ('staged','tombstoned')), foreign key (project_id, epoch, generation, digest) references accepted_project_snapshots(project_id, epoch, generation, digest))"
  ]
};
