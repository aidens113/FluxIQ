// Narrow physical database ownership boundary; no project mutations or schema facade.
export { AutomationStudioProjectDatabase, AutomationStudioProjectDatabasePool } from "../database.ts";
export type { AutomationStudioProjectDatabaseLease, AutomationStudioSqlExecutor } from "../database.ts";
