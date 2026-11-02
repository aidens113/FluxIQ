import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";
/** Allocated after inspecting the current project migration head, 0036. */
export const AUTOMATION_STUDIO_EXECUTION_ADMISSION_MIGRATION: AutomationStudioSchemaMigration = {
    id: "0037_execution_admission_v1",
    statements: [
        "create table execution_admission_events (sequence integer primary key autoincrement, event_id text not null unique, mutation_id text not null unique, operation text not null, request_json text not null, changes_json text not null, proof_digest text not null)",
        "create table execution_admission_scopes (scope_id text primary key, identity_key text not null unique, data_json text not null, proof_event_id text not null references execution_admission_events(event_id))",
        "create table execution_admission_entries (entry_id text primary key, scope_id text not null references execution_admission_scopes(scope_id), root_id text not null, parent_id text references execution_admission_entries(entry_id), data_json text not null, proof_event_id text not null references execution_admission_events(event_id))",
        "create table execution_admission_fences (resource_key text primary key, data_json text not null, proof_event_id text not null references execution_admission_events(event_id))",
        "create table execution_admission_facts (fact_id text primary key, entry_id text not null references execution_admission_entries(entry_id), data_json text not null, proof_event_id text not null references execution_admission_events(event_id))",
        "create table execution_admission_command_links (command_id text primary key references gateway_command_claims(command_id), entry_id text not null references execution_admission_entries(entry_id), data_json text not null, proof_event_id text not null references execution_admission_events(event_id))",
        "create index execution_admission_entries_scope on execution_admission_entries(scope_id)",
        "create index execution_admission_entries_root on execution_admission_entries(root_id)",
        "create index execution_admission_entries_parent on execution_admission_entries(parent_id)",
        "create index execution_admission_facts_entry on execution_admission_facts(entry_id)",
        "create index execution_admission_links_entry on execution_admission_command_links(entry_id)"
    ]
};
