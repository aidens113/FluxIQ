import { describe, expect, it } from "vitest";
import { AutomationStudioDataCache } from "./useAutomationStudioCache";

describe("Automation Studio summary/detail cache", () => {
  it("owns project-scoped summary and detail entries", () => {
    const cache = new AutomationStudioDataCache();
    cache.set("summary", "project-a", "root", { runs: 2 }, 100);
    cache.set("flow", "project-a", "flow-1", { name: "Build" }, 100);
    expect(cache.get("summary", "project-a", "root", 50, 120)).toEqual({ runs: 2 });
    expect(cache.get("flow", "project-a", "flow-1", 50, 120)).toEqual({ name: "Build" });
  });

  it("expires old entries and invalidates only the mutated project", () => {
    const cache = new AutomationStudioDataCache();
    cache.set("flow", "project-a", "flow-1", { id: 1 }, 100);
    cache.set("flow", "project-b", "flow-1", { id: 2 }, 100);
    expect(cache.get("flow", "project-a", "flow-1", 10, 120)).toBeUndefined();
    cache.invalidateProject("project-b");
    expect(cache.size).toBe(0);
  });
});
