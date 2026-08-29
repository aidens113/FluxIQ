import { describe, expect, it } from "vitest";
import { countRenderCommits } from "../../../../e2e/support/performance";

describe("Playwright performance evidence helpers", () => {
  it("counts exact render commits rather than trusting component-local cumulative counts", () => {
    expect(countRenderCommits([
      { component: "AutomationStudioLive" },
      { component: "AutomationStudioHierarchyBoundary" },
      { component: "AutomationStudioHierarchyBoundary" },
    ])).toEqual({
      AutomationStudioLive: 1,
      AutomationStudioHierarchyBoundary: 2,
    });
  });
});