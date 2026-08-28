import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SQLiteRepository, createRecord } from "../database-manager/storage/sqlite-repository.ts";
import {
  clearFluxIQPerformanceMetrics,
  fluxiqPerformanceMetricsSnapshot,
  recordProgramEndpointPerformance,
  recordSqlPerformance,
  serializedMetricBytes,
  withEndpointPerformanceScope,
  withSqlPerformanceContext
} from "./performance-metrics.ts";

describe("performance metrics", () => {
  it("attributes SQL metrics to the active endpoint without retaining SQL values", async () => {
    clearFluxIQPerformanceMetrics();
    const { sql } = await withEndpointPerformanceScope(() => withSqlPerformanceContext(
      { repositoryKind: "automation.flows", databaseName: "project.sqlite" },
      async () => {
        recordSqlPerformance({ operation: "all", sql: "select * from flows where project_id = ?", elapsedMs: 4, rowsReturned: 3, ok: true });
      }
    ));
    expect(sql).toMatchObject({ sqlDurationMs: 4, sqlQueryCount: 1, sqlRowsReturned: 3 });
    expect(fluxiqPerformanceMetricsSnapshot()).toEqual([
      expect.objectContaining({ kind: "sql", repositoryKind: "automation.flows", rowsReturned: 3 })
    ]);
    expect(JSON.stringify(fluxiqPerformanceMetricsSnapshot())).not.toContain("project_id = ?");
  });

  it("records endpoint metadata and serialized byte size", () => {
    clearFluxIQPerformanceMetrics();
    recordProgramEndpointPerformance({
      programId: "automation-studio", endpoint: "list-flows", elapsedMs: 8,
      responseBytes: serializedMetricBytes({ ok: true }), sqlDurationMs: 3,
      sqlQueryCount: 1, sqlRowsReturned: 2, sqlRowsChanged: 0,
      possibleFullScanCount: 0, ok: true
    });
    expect(fluxiqPerformanceMetricsSnapshot(1)[0]).toMatchObject({ kind: "endpoint", endpoint: "list-flows", sqlRowsReturned: 2 });
  });

  it("collects query duration and row counts from real repository operations", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-performance-"));
    clearFluxIQPerformanceMetrics();
    try {
      const repository = new SQLiteRepository({ rootDir, kind: "automation.metrics" });
      const { sql } = await withEndpointPerformanceScope(async () => {
        await repository.put(createRecord({ id: "flow.1", kind: repository.kind, data: { name: "Measured Flow" } }));
        await repository.listPage({}, { limit: 10 });
      });
      expect(sql.sqlQueryCount).toBeGreaterThan(0);
      expect(sql.sqlRowsReturned).toBeGreaterThan(0);
      expect(sql.sqlRowsChanged).toBeGreaterThan(0);
      expect(fluxiqPerformanceMetricsSnapshot().some((metric) => metric.kind === "sql" && metric.repositoryKind === "automation.metrics")).toBe(true);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
