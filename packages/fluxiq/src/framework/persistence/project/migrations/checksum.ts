import { createHash } from "node:crypto";
import type { AutomationStudioSchemaMigration } from "./contracts/index.ts";

export function automationStudioMigrationChecksum(migration: AutomationStudioSchemaMigration): string {
  return createHash("sha256").update(JSON.stringify({ id: migration.id, statements: migration.statements })).digest("hex");
}
