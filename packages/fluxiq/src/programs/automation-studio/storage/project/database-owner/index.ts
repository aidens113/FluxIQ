// Narrow physical database ownership boundary; no project mutations or schema facade.
export { AutomationStudioProjectDatabase, AutomationStudioProjectDatabasePool } from "../../../../../framework/persistence/project/sql/index.ts";
export type { AutomationStudioProjectDatabaseLease, AutomationStudioSqlExecutor } from "../../../../../framework/persistence/project/sql/index.ts";
