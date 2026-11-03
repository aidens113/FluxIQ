import type { AutomationStudioProjectDatabase } from "../../sql/index.ts";
import type { AutomationStudioSchemaMigration } from "./migration.ts";
import type { AutomationStudioSchemaBackupContext } from "./backup-context.ts";

export type AutomationStudioSchemaMigrationRunnerOptions = {
  database: AutomationStudioProjectDatabase;
  migrations: readonly AutomationStudioSchemaMigration[];
  backup?: (context: AutomationStudioSchemaBackupContext) => Promise<void>;
  lockTimeoutMs?: number;
  now?: () => number;
  createLockToken?: () => string;
};
