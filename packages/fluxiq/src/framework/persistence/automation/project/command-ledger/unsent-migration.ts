import type { AutomationStudioSchemaMigration } from "../../schema-migrations.ts";

/** Append-only server admission history; the original claim remains a permanent no-resend key. */
export const AUTOMATION_STUDIO_COMMAND_UNSENT_MIGRATION: AutomationStudioSchemaMigration = {
  id: "0038_gateway_command_unsent_refusals_v1",
  statements: [
    "create table if not exists gateway_command_unsent_refusals (command_id text primary key references gateway_command_claims(command_id), code text not null, refused_at_ms integer not null check(refused_at_ms>=0), proof_digest text not null)"
  ]
};
