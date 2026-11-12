import type { AutomationStudioSchemaMigration } from "../schema-migrations.ts";

/** Compose independently owned migration sets without changing them or hiding duplicate IDs. */
export function automationStudioSchemaMigrationOrder(...groups: readonly (readonly AutomationStudioSchemaMigration[])[]): AutomationStudioSchemaMigration[] {
  return groups.flatMap((group) => [...group]).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
