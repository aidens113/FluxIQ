import { createHash } from "node:crypto";
import type { SqlPerformanceMetric } from "../types/index.ts";
import { performanceMetricRegistry, publishPerformanceMetric } from "../registry/index.ts";
const { sqlContext, endpointScope } = performanceMetricRegistry;

export function recordSqlPerformance(input: {
  operation: SqlPerformanceMetric["operation"];
  sql: string;
  elapsedMs: number;
  rowsReturned?: number;
  rowsChanged?: number;
  ok: boolean;
}): void {
  const context = sqlContext.getStore();
  if (!context) return;
  const normalized = normalizeSql(input.sql);
  const metric: SqlPerformanceMetric = {
    kind: "sql",
    ...context,
    operation: input.operation,
    statementType: normalized.split(" ", 1)[0]?.toLowerCase() || "unknown",
    fingerprint: createHash("sha256").update(normalized).digest("hex").slice(0, 16),
    elapsedMs: input.elapsedMs,
    rowsReturned: input.rowsReturned ?? 0,
    rowsChanged: input.rowsChanged ?? 0,
    possibleFullScan: possibleFullScan(normalized),
    ok: input.ok,
    recordedAt: Date.now()
  };
  const scope = endpointScope.getStore();
  if (scope) {
    scope.sqlDurationMs += metric.elapsedMs;
    scope.sqlQueryCount += 1;
    scope.sqlRowsReturned += metric.rowsReturned;
    scope.sqlRowsChanged += metric.rowsChanged;
    if (metric.possibleFullScan) scope.possibleFullScanCount += 1;
  }
  publishPerformanceMetric(metric);
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

function possibleFullScan(sql: string): boolean {
  if (!sql.startsWith("select ") || !sql.includes(" from ")) return false;
  return !sql.includes(" where ") && !sql.includes(" limit ");
}
