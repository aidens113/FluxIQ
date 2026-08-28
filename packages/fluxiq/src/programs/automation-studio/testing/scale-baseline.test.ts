import { describe, expect, it } from "vitest";
import { measureAutomationStudioLegacyBaseline } from "./scale-baseline.ts";

describe("Automation Studio legacy scale baseline", () => {
  it("measures every documented operation with bounded result pages", () => {
    const report = measureAutomationStudioLegacyBaseline(100);
    expect(Object.keys(report.measurements)).toEqual(["project-open", "graph-open", "node-move", "save", "run-list", "event-page"]);
    expect(report).toMatchObject({ nodeCount: 100, edgeCount: 250, runCount: 100, eventCount: 100 });
    expect(report.measurements["run-list"].resultCount).toBe(50);
    expect(report.measurements["event-page"].resultCount).toBe(50);
    expect(report.measurements.save.responseBytes).toBe(report.graphBytes);
  });
});
