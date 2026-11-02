import { afterEach, describe, expect, it } from "vitest";
import * as legacy from "../performance-metrics.ts";
import * as metrics from "../../../framework/observability/performance/index.ts";

afterEach(() => { metrics.clearFluxIQPerformanceMetrics(); });

describe("framework performance compatibility", () => {
  it("retains original functions and one cross-import listener/metric registry", async () => {
    for (const name of ["withSqlPerformanceContext", "withEndpointPerformanceScope", "recordSqlPerformance", "recordProgramEndpointPerformance", "fluxiqPerformanceMetricsSnapshot", "clearFluxIQPerformanceMetrics", "subscribeFluxIQPerformanceMetrics", "serializedMetricBytes"] as const) {
      expect(legacy[name]).toBe(metrics[name]);
    }
    metrics.clearFluxIQPerformanceMetrics();
    const seen: metrics.FluxIQPerformanceMetric[] = [];
    const unsubscribe = legacy.subscribeFluxIQPerformanceMetrics(metric => seen.push(metric));
    try {
      const measured = await legacy.withEndpointPerformanceScope(() => metrics.withSqlPerformanceContext(
        { repositoryKind: "fixture.records", databaseName: "fixture.sqlite" },
        async () => {
          await Promise.resolve();
          legacy.recordSqlPerformance({ operation: "get", sql: "select data from records where id=?", elapsedMs: 4, rowsReturned: 1, ok: true });
        }
      ));
      expect(measured.sql).toMatchObject({ sqlDurationMs: 4, sqlQueryCount: 1, sqlRowsReturned: 1 });
      expect(seen).toEqual(metrics.fluxiqPerformanceMetricsSnapshot());
      expect(seen[0]).toMatchObject({ kind: "sql", repositoryKind: "fixture.records" });
      legacy.clearFluxIQPerformanceMetrics();
      expect(metrics.fluxiqPerformanceMetricsSnapshot()).toEqual([]);
    } finally {
      unsubscribe();
    }
    await metrics.withSqlPerformanceContext({ repositoryKind: "unsubscribed", databaseName: "fixture.sqlite" }, async () => {
      metrics.recordSqlPerformance({ operation: "run", sql: "delete from records where id=?", elapsedMs: 1, ok: true });
    });
    expect(seen).toHaveLength(1);
  });

  it("preserves both AsyncLocalStorage scopes across interleaved old and canonical calls", async () => {
    metrics.clearFluxIQPerformanceMetrics();
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const first = legacy.withEndpointPerformanceScope(() => metrics.withSqlPerformanceContext(
      { repositoryKind: "first", databaseName: "first.sqlite" },
      async () => {
        entered();
        await held;
        legacy.recordSqlPerformance({ operation: "all", sql: "select id from first where id=?", elapsedMs: 3, rowsReturned: 2, ok: true });
      }
    ));
    await started;
    let second: Awaited<ReturnType<typeof metrics.withEndpointPerformanceScope>>;
    try {
      second = await metrics.withEndpointPerformanceScope(() => legacy.withSqlPerformanceContext(
        { repositoryKind: "second", databaseName: "second.sqlite" },
        async () => {
          await Promise.resolve();
          metrics.recordSqlPerformance({ operation: "all", sql: "select id from second where id=?", elapsedMs: 7, rowsReturned: 5, ok: true });
        }
      ));
    } finally {
      release();
    }
    const completed = await first;
    expect(completed.sql).toMatchObject({ sqlDurationMs: 3, sqlQueryCount: 1, sqlRowsReturned: 2 });
    expect(second.sql).toMatchObject({ sqlDurationMs: 7, sqlQueryCount: 1, sqlRowsReturned: 5 });
    expect(metrics.fluxiqPerformanceMetricsSnapshot().map(metric => metric.kind === "sql" && metric.repositoryKind)).toEqual(["second", "first"]);
  });
});
