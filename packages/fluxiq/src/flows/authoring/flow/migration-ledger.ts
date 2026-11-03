import type { AutomationStudioFlowMigrationOutcome } from "./index.ts";

/** Durable audit record for an explicit, non-destructive legacy Flow migration. */
export type AutomationStudioFlowMigrationLedger = {
  schemaVersion: "0.1";
  migrationId: string;
  backupId: string;
  projectId: string;
  status: "completed" | "partial";
  outcomes: AutomationStudioFlowMigrationOutcome[];
  createdAt: number;
  updatedAt: number;
  rolledBackAt?: number;
};
