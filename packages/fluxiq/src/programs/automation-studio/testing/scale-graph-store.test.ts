import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { measureAutomationStudioGraphStoreBenchmark } from "./scale-graph-store.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-scale-graph-store-test");

describe("measureAutomationStudioGraphStoreBenchmark", () => {
  beforeEach(async () => { await rm(rootDir, { recursive: true, force: true }); await mkdir(rootDir, { recursive: true }); });
  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

  it("exercises the SQL graph viewport and patch path with bounded responses", async () => {
    const result = await measureAutomationStudioGraphStoreBenchmark({ rootDir, nodeCount: 30, edgeCount: 50 });
    expect(result).toMatchObject({ architecture: "sql-graph-partitions", nodeCount: 30, edgeCount: 50 });
    expect(result.measurements.viewport.responseBytes).toBeLessThan(1_000_000);
    expect(result.measurements.move.resultCount).toBe(1);
    expect(result.measurements.connect.resultCount).toBe(1);
    expect(result.measurements.delete.resultCount).toBe(1);
    expect(result.measurements.search.resultCount).toBeGreaterThan(0);
  });
});
