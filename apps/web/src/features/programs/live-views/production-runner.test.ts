import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { newestProductionLogRows, productionParameterFields } from "./production-runner";

describe("ProductionRunnerLive contract", () => {
  it("derives bounded friendly parameter controls from target schema", () => {
    expect(productionParameterFields({ properties: { retries: { title: "Retries", type: "number", default: 2 }, enabled: { type: "boolean" } } })).toEqual([
      { name: "retries", label: "Retries", type: "number", defaultValue: 2 },
      { name: "enabled", label: "enabled", type: "boolean" }
    ]);
    expect(productionParameterFields(null)).toEqual([]);
  });

  it("removes raw JSON input and bounds visible logs", () => {
    const source = readFileSync(new URL("./production-runner.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("Parameters JSON");
    expect(source).not.toContain("parametersText");
    expect(source).toContain("allLogRows.slice(0, 500)");
    expect(source).toContain("Selected Run");
    expect(source).toContain("onCancel");
    expect(source).toContain("onAdvance");
  });

  it("sorts deterministically newest-first before applying the 500-row cap", () => {
    const runs = Array.from({ length: 510 }, (_, index) => ({
      id: `run-${String(index).padStart(3, "0")}`,
      name: `Run ${index}`,
      status: "completed" as const,
      executions: [{ loop: 1, atMs: index === 508 || index === 509 ? 999 : index, ok: true }]
    }));
    const ordered = newestProductionLogRows(runs).slice(0, 500);
    expect(ordered).toHaveLength(500);
    expect(ordered.slice(0, 2).map((row) => row.id)).toEqual(["run-509:1", "run-508:1"]);
    expect(ordered.at(-1)?.atMs).toBe(10);
  });

  it("distinguishes loading, request failure, empty targets, empty logs, and ready state", () => {
    const source = readFileSync(new URL("./production-runner.tsx", import.meta.url), "utf8");
    expect(source).toContain('label="Loading Production Runner"');
    expect(source).toContain('title="Production Runner unavailable"');
    expect(source).toContain('title="No production targets"');
    expect(source).toContain('empty="No execution logs yet."');
    expect(source).toContain("disabled={!selectedTarget}");
  });
});
