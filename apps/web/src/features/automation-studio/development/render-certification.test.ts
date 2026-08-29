import { describe, expect, it } from "vitest";
import { renderCountFor, summarizeAutomationStudioRenderWindow } from "./render-certification";

describe("Automation Studio render certification", () => {
  it("counts exact commits within one interaction window", () => {
    const summary = summarizeAutomationStudioRenderWindow([
      { component: "AutomationStudioHierarchyBoundary", count: 10, recordedAt: 1 },
      { component: "AutomationStudioHierarchyBoundary", count: 11, recordedAt: 2 },
      { component: "AutomationStudioSelectionBoundary", count: 4, recordedAt: 3 },
    ], ["AutomationStudioHierarchyBoundary", "AutomationStudioSelectionBoundary"]);
    expect(renderCountFor(summary, "AutomationStudioHierarchyBoundary")).toBe(2);
    expect(renderCountFor(summary, "AutomationStudioSelectionBoundary")).toBe(1);
    expect(summary.missingBoundaries).toEqual([]);
  });

  it("reports missing and unknown Studio boundaries", () => {
    const summary = summarizeAutomationStudioRenderWindow([
      { component: "AutomationStudioUnexpectedBoundary", count: 1, recordedAt: 1 },
    ], ["AutomationStudioLive"]);
    expect(summary.missingBoundaries).toEqual(["AutomationStudioLive"]);
    expect(summary.unexpectedBoundaries).toEqual(["AutomationStudioUnexpectedBoundary"]);
  });
});