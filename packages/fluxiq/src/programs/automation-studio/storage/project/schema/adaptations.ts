// 0009 — adaptation provenance, artifacts, audit events, and revision safety.
import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";
import { foreignKeyGuards } from "./foreign-key-guards.ts";

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
