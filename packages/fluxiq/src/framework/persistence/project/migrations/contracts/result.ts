export type AutomationStudioSchemaMigrationResult = {
  applied: string[];
  skipped: string[];
  backupCreated: boolean;
  status: "ready";
};
