import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";

export const AUTOMATION_STUDIO_AUTHORITY_GUARD_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0028_original_project_authority_guard_v1",
  statements: [
    "create table authority_guard_projects (project_id text primary key, protocol_version integer not null check(protocol_version=1), mode text not null check(mode in ('legacy','capturing')), revision integer not null check(revision>=0), last_operation_key text, capture_key text)",
    "create table authority_guard_legacy (operation_key text primary key, project_id text not null references authority_guard_projects(project_id), request_json text not null, claim_json text not null, predecessor_key text, unknown_json text, completion_json text, completed_revision integer unique)",
    "create table authority_guard_captures (capture_key text primary key, project_id text not null references authority_guard_projects(project_id), request_json text not null, capture_json text not null, unknown_json text, release_json text)"
  ]
};
