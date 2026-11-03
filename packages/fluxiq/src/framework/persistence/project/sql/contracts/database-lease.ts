import type { AutomationStudioProjectDatabase } from "../database.ts";

export type AutomationStudioProjectDatabaseLease = {
  projectId: string;
  database: AutomationStudioProjectDatabase;
  release(): Promise<void>;
};
