import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

export type SqlPerformanceMetric = {
  kind: "sql";
  repositoryKind: string;
  databaseName: string;
  operation: "run" | "all" | "get";
  statementType: string;
  fingerprint: string;
  elapsedMs: number;
  rowsReturned: number;
  rowsChanged: number;
  possibleFullScan: boolean;
  ok: boolean;
  recordedAt: number;
};

export type ProgramEndpointPerformanceMetric = {
  kind: "endpoint";
  programId: string;
  endpoint: string;
  elapsedMs: number;
  responseBytes: number;
  sqlDurationMs: number;
  sqlQueryCount: number;
  sqlRowsReturned: number;
  sqlRowsChanged: number;
  possibleFullScanCount: number;
  ok: boolean;
  recordedAt: number;
};

export type FluxIQPerformanceMetric = SqlPerformanceMetric | ProgramEndpointPerformanceMetric;
export type SqlPerformanceContext = { repositoryKind: string; databaseName: string };

type EndpointScope = {
  sqlDurationMs: number;
  sqlQueryCount: number;
  sqlRowsReturned: number;
  sqlRowsChanged: number;
  possibleFullScanCount: number;
};

const MAX_METRICS = 2_000;
const metrics: FluxIQPerformanceMetric[] = [];
const listeners = new Set<(metric: FluxIQPerformanceMetric) => void>();
const sqlContext = new AsyncLocalStorage<SqlPerformanceContext>();
const endpointScope = new AsyncLocalStorage<EndpointScope>();

export function withSqlPerformanceContext<T>(context: SqlPerformanceContext, operation: () => Promise<T>): Promise<T> {
  return sqlContext.run(context, operation);
}

export async function withEndpointPerformanceScope<T>(operation: () => Promise<T>): Promise<{ result: T; sql: EndpointScope }> {
  const sql = emptyEndpointScope();
  const result = await endpointScope.run(sql, operation);
  return { result, sql: { ...sql } };
}

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

export function recordProgramEndpointPerformance(metric: Omit<ProgramEndpointPerformanceMetric, "kind" | "recordedAt">): void {
  publishPerformanceMetric({ kind: "endpoint", ...metric, recordedAt: Date.now() });
}

export function fluxiqPerformanceMetricsSnapshot(limit = 200): FluxIQPerformanceMetric[] {
  const safeLimit = Math.max(1, Math.min(MAX_METRICS, Math.trunc(limit) || 200));
  return metrics.slice(-safeLimit).map((metric) => ({ ...metric }));
}

export function clearFluxIQPerformanceMetrics(): void {
  metrics.length = 0;
}

export function subscribeFluxIQPerformanceMetrics(listener: (metric: FluxIQPerformanceMetric) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function serializedMetricBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return 0;
  }
}

function publishPerformanceMetric(metric: FluxIQPerformanceMetric): void {
  metrics.push(metric);
  if (metrics.length > MAX_METRICS) metrics.splice(0, metrics.length - MAX_METRICS);
  for (const listener of listeners) listener({ ...metric });
}

function emptyEndpointScope(): EndpointScope {
  return { sqlDurationMs: 0, sqlQueryCount: 0, sqlRowsReturned: 0, sqlRowsChanged: 0, possibleFullScanCount: 0 };
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

function possibleFullScan(sql: string): boolean {
  if (!sql.startsWith("select ") || !sql.includes(" from ")) return false;
  return !sql.includes(" where ") && !sql.includes(" limit ");
}
