import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { summarizePreloadMetrics } from "./DataInspector";

describe("Automation Studio data inspector", () => {
  it("provides separate data views without adding an inspector polling loop", () => {
    const source = readFileSync(new URL("./DataInspector.tsx", import.meta.url), "utf8");
    expect(source).toContain('options={["Overview", "Requests", "SQL", "Browser", "Preload"]}');
    expect(source).toContain('"automation-studio:preload-metric"');
    expect(source).toContain("MAX_PRELOAD_METRICS");
    expect(source).toContain('"get-performance-metrics"');
    expect(source).toContain('"delete-project-ui-cache"');
    expect(source).toContain("Clear UI cache");
    expect(source).not.toContain("setInterval");
  });

  it("summarizes preload queue progress from recent metric events", () => {
    const summary = summarizePreloadMetrics([
      { phase: "queued", projectId: "project.one", generation: 2, queuedTasks: 3, completedTasks: 0, recordedAt: 1 },
      { phase: "task-started", projectId: "project.one", generation: 2, taskId: "task.a", endpoint: "get-flow-router", recordedAt: 2 },
      { phase: "task-finished", projectId: "project.one", generation: 2, taskId: "task.a", endpoint: "get-flow-router", queuedTasks: 3, completedTasks: 1, ok: true, elapsedMs: 12, recordedAt: 3 },
      { phase: "task-started", projectId: "project.one", generation: 2, taskId: "task.b", endpoint: "list-flow-runs", recordedAt: 4 }
    ]);

    expect(summary).toMatchObject({
      status: "Running",
      projectId: "project.one",
      generation: "2",
      queuedTasks: 3,
      completedTasks: 1,
      inFlightTasks: 1,
      failedTasks: 0,
      latestEndpoint: "list-flow-runs"
    });
  });

  it("handles an empty preload metric buffer", () => {
    expect(summarizePreloadMetrics([])).toMatchObject({ status: "No events", projectId: "None", queuedTasks: 0 });
  });
});