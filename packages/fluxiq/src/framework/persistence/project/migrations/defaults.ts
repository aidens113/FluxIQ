import type { AutomationStudioSchemaMigration } from "./contracts/index.ts";
import { AUTOMATION_STUDIO_PROJECT_DOMAIN_RESOURCE_MIGRATION, AUTOMATION_STUDIO_PROJECT_RELATION_INDEX_MIGRATION, AUTOMATION_STUDIO_PROJECT_MUTATION_MIGRATION, AUTOMATION_STUDIO_PROJECT_STREAM_SPOOL_MIGRATION, AUTOMATION_STUDIO_PROJECT_EVENT_CURSOR_MIGRATION, AUTOMATION_STUDIO_PROJECT_RETENTION_MIGRATION, AUTOMATION_STUDIO_PROJECT_COMPILED_RUNTIME_ISOLATION_MIGRATION, AUTOMATION_STUDIO_PROJECT_ADAPTATION_EVIDENCE_MIGRATION, AUTOMATION_STUDIO_PROJECT_FAST_UI_QUERY_INDEX_MIGRATION, AUTOMATION_STUDIO_PROJECT_ROUTER_RUNTIME_SCALING_MIGRATION, AUTOMATION_STUDIO_PROJECT_ROUTER_RUNTIME_SUMMARY_DETAIL_MIGRATION, AUTOMATION_STUDIO_PROJECT_ROUTER_TARGET_REFERENCE_MIGRATION, AUTOMATION_STUDIO_PROJECT_INTERVENTION_MODE_MIGRATION, AUTOMATION_STUDIO_PROJECT_RUNTIME_SUMMARY_ENVELOPE_MIGRATION, AUTOMATION_STUDIO_PROJECT_REUSABLE_LLM_CONTEXT_MIGRATION, AUTOMATION_STUDIO_PROJECT_REUSABLE_LLM_CONTEXT_AUDIT_MIGRATION, AUTOMATION_STUDIO_PROJECT_REUSABLE_LLM_CONTEXT_VALIDATION_MIGRATION, AUTOMATION_STUDIO_PROJECT_RUN_DATASET_MIGRATION, AUTOMATION_STUDIO_PROJECT_ADAPTATION_MATCHING_MIGRATION, AUTOMATION_STUDIO_PROJECT_CONVERSATION_MIGRATION, AUTOMATION_STUDIO_PROJECT_RESULT_CHECK_MIGRATION, AUTOMATION_STUDIO_PROJECT_FLOW_GRAPH_JUDGEMENT_MIGRATION, AUTOMATION_STUDIO_PROJECT_RUN_DATASET_ANSWER_MIGRATION, AUTOMATION_STUDIO_PROJECT_RUNTIME_RUN_INTERRUPTED_STATUS_MIGRATION, AUTOMATION_STUDIO_PROJECT_FLOW_SCOPED_KEY_MIGRATION, AUTOMATION_STUDIO_PROJECT_RECORDING_STREAM_MIGRATION, AUTOMATION_STUDIO_PROJECT_RECORDING_DESCRIPTION_MIGRATION, AUTOMATION_STUDIO_PROJECT_INSTRUCTION_NODE_SCOPE_MIGRATION, AUTOMATION_STUDIO_PROJECT_CONVERSATION_TURN_DECISION_MIGRATION } from "../schema/index.ts";

export const AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS: readonly AutomationStudioSchemaMigration[] = [{
  id: "0001_project_administration",
  statements: [
    `create table project_meta (
      project_id text primary key,
      name text not null,
      description text not null default '',
      domain_id text,
      revision integer not null default 1 check (revision > 0),
      created_at_ms integer not null,
      updated_at_ms integer not null
    )`,
    `create table change_feed (
      sequence integer primary key autoincrement,
      transaction_id text not null,
      entity_kind text not null,
      entity_id text not null,
      operation text not null check (operation in ('create', 'update', 'delete', 'touch')),
      revision integer not null check (revision > 0),
      changed_at_ms integer not null
    )`,
    "create index change_feed_transaction_idx on change_feed (transaction_id, sequence)",
    "create index change_feed_entity_idx on change_feed (entity_kind, entity_id, sequence)",
    "create index change_feed_changed_idx on change_feed (changed_at_ms, sequence)",
    `create table storage_outbox (
      outbox_id text primary key,
      operation text not null check (operation in ('put_file', 'delete_file', 'move_file', 'verify_file')),
      staged_path text,
      final_path text not null,
      sha256 text,
      status text not null default 'pending' check (status in ('pending', 'in_progress', 'done', 'failed', 'abandoned')),
      attempt_count integer not null default 0 check (attempt_count >= 0),
      created_at_ms integer not null,
      updated_at_ms integer not null
    )`,
    "create index storage_outbox_status_idx on storage_outbox (status, updated_at_ms, outbox_id)",
    "create index storage_outbox_final_path_idx on storage_outbox (final_path)",
    `create table migration_jobs (
      job_id text primary key,
      kind text not null,
      cursor_json text not null default '{}',
      status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
      error_json text,
      started_at_ms integer,
      updated_at_ms integer not null,
      completed_at_ms integer
    )`,
    "create index migration_jobs_status_idx on migration_jobs (status, updated_at_ms, job_id)",
    "create index migration_jobs_kind_idx on migration_jobs (kind, status, updated_at_ms, job_id)",
    `create table background_jobs (
      job_id text primary key,
      kind text not null,
      owner_kind text not null,
      owner_id text not null,
      status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed', 'cancelled')),
      priority integer not null default 0,
      input_object_id text,
      output_object_id text,
      attempts integer not null default 0 check (attempts >= 0),
      available_at_ms integer not null,
      started_at_ms integer,
      finished_at_ms integer,
      error_json text,
      created_at_ms integer not null,
      updated_at_ms integer not null
    )`,
    "create index background_jobs_ready_idx on background_jobs (status, available_at_ms, priority desc, created_at_ms, job_id)",
    "create index background_jobs_owner_idx on background_jobs (owner_kind, owner_id, status, updated_at_ms, job_id)",
    "create index background_jobs_input_object_idx on background_jobs (input_object_id)",
    "create index background_jobs_output_object_idx on background_jobs (output_object_id)"
  ]
}, AUTOMATION_STUDIO_PROJECT_DOMAIN_RESOURCE_MIGRATION, AUTOMATION_STUDIO_PROJECT_RELATION_INDEX_MIGRATION, AUTOMATION_STUDIO_PROJECT_MUTATION_MIGRATION, AUTOMATION_STUDIO_PROJECT_STREAM_SPOOL_MIGRATION, AUTOMATION_STUDIO_PROJECT_EVENT_CURSOR_MIGRATION, AUTOMATION_STUDIO_PROJECT_RETENTION_MIGRATION, AUTOMATION_STUDIO_PROJECT_COMPILED_RUNTIME_ISOLATION_MIGRATION, AUTOMATION_STUDIO_PROJECT_ADAPTATION_EVIDENCE_MIGRATION, AUTOMATION_STUDIO_PROJECT_FAST_UI_QUERY_INDEX_MIGRATION, AUTOMATION_STUDIO_PROJECT_ROUTER_RUNTIME_SCALING_MIGRATION, AUTOMATION_STUDIO_PROJECT_ROUTER_RUNTIME_SUMMARY_DETAIL_MIGRATION, AUTOMATION_STUDIO_PROJECT_ROUTER_TARGET_REFERENCE_MIGRATION, AUTOMATION_STUDIO_PROJECT_INTERVENTION_MODE_MIGRATION, AUTOMATION_STUDIO_PROJECT_RUNTIME_SUMMARY_ENVELOPE_MIGRATION, AUTOMATION_STUDIO_PROJECT_REUSABLE_LLM_CONTEXT_MIGRATION, AUTOMATION_STUDIO_PROJECT_REUSABLE_LLM_CONTEXT_AUDIT_MIGRATION, AUTOMATION_STUDIO_PROJECT_REUSABLE_LLM_CONTEXT_VALIDATION_MIGRATION, AUTOMATION_STUDIO_PROJECT_RUN_DATASET_MIGRATION, AUTOMATION_STUDIO_PROJECT_ADAPTATION_MATCHING_MIGRATION, AUTOMATION_STUDIO_PROJECT_CONVERSATION_MIGRATION, AUTOMATION_STUDIO_PROJECT_RESULT_CHECK_MIGRATION, AUTOMATION_STUDIO_PROJECT_FLOW_GRAPH_JUDGEMENT_MIGRATION, AUTOMATION_STUDIO_PROJECT_RUN_DATASET_ANSWER_MIGRATION, AUTOMATION_STUDIO_PROJECT_RUNTIME_RUN_INTERRUPTED_STATUS_MIGRATION, AUTOMATION_STUDIO_PROJECT_FLOW_SCOPED_KEY_MIGRATION, AUTOMATION_STUDIO_PROJECT_RECORDING_STREAM_MIGRATION, AUTOMATION_STUDIO_PROJECT_RECORDING_DESCRIPTION_MIGRATION, AUTOMATION_STUDIO_PROJECT_INSTRUCTION_NODE_SCOPE_MIGRATION, AUTOMATION_STUDIO_PROJECT_CONVERSATION_TURN_DECISION_MIGRATION] as const;
