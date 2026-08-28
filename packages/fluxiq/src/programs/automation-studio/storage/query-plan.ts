import type { AutomationStudioSqlExecutor } from "./project-database.ts";

export type AutomationStudioQueryPlanRow = { id: number; parent: number; notused: number; detail: string };

export async function explainAutomationStudioQueryPlan(database: AutomationStudioSqlExecutor, sql: string, params: readonly unknown[] = []): Promise<AutomationStudioQueryPlanRow[]> {
  return database.all<AutomationStudioQueryPlanRow>(`explain query plan ${sql}`, params);
}

export function automationStudioPlanDetails(rows: readonly AutomationStudioQueryPlanRow[]): string[] {
  return rows.map((row) => row.detail);
}

export function assertNoCriticalFullScan(rows: readonly AutomationStudioQueryPlanRow[], tableNames: readonly string[]): void {
  const details = automationStudioPlanDetails(rows);
  const offenders = details.filter((detail) => {
    const normalized = detail.toLowerCase();
    return tableNames.some((tableName) => {
      const table = tableName.toLowerCase();
      return normalized.includes(`scan ${table}`) && !normalized.includes("using index") && !normalized.includes("using covering index") && !normalized.includes("virtual table index");
    });
  });
  if (offenders.length) throw new Error(`Critical Automation Studio query plan contains full table scan: ${offenders.join(" | ")}`);
}

export function assertPlanMentions(rows: readonly AutomationStudioQueryPlanRow[], expected: string): void {
  const details = automationStudioPlanDetails(rows).join(" | ").toLowerCase();
  if (!details.includes(expected.toLowerCase())) throw new Error(`Automation Studio query plan did not mention ${expected}: ${details}`);
}

