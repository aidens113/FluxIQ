import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";

export const AUTOMATION_STUDIO_COMMAND_LEDGER_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0027_gateway_command_receipts_v1",
  statements: [
    "create table if not exists gateway_command_claims (command_id text primary key, claim_json text not null, proof_digest text not null, claimed_at_ms integer not null check(claimed_at_ms>=0))",
    "create table if not exists gateway_command_receipts (command_id text primary key references gateway_command_claims(command_id), receipt_json text not null, proof_digest text not null, committed_at_ms integer not null check(committed_at_ms>=0))",
    "create table if not exists gateway_command_unknowns (command_id text primary key references gateway_command_claims(command_id), reason text not null, proof_digest text not null)"
  ]
};
