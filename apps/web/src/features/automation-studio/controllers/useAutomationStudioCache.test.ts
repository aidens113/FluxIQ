import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
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

  it("invalidates scoped entries without clearing unrelated project data", () => {
    const cache = new AutomationStudioDataCache();
    cache.set("summary", "project-a", "root", { runs: 2 }, 100);
    cache.set("flow", "project-a", "flow-1", { id: 1 }, 100);
    cache.set("recording", "project-a", "recording-1", { id: 2 }, 100);
    cache.set("flow", "project-b", "flow-1", { id: 3 }, 100);

    cache.invalidateScopes("project-a", ["flow"], ["flow-1"]);

    expect(cache.get("flow", "project-a", "flow-1", 1_000, 120)).toBeUndefined();
    expect(cache.get("summary", "project-a", "root", 1_000, 120)).toEqual({ runs: 2 });
    expect(cache.get("recording", "project-a", "recording-1", 1_000, 120)).toEqual({ id: 2 });
    expect(cache.get("flow", "project-b", "flow-1", 1_000, 120)).toEqual({ id: 3 });
  });

  it("keeps root summaries when feed reconciliation invalidates exact entity resources", () => {
    const cache = new AutomationStudioDataCache();
    cache.set("summary", "project-a", "root", { flows: 2 }, 100);
    cache.set("summary", "project-a", "flow-1", { row: "stale" }, 100);
    cache.set("flow", "project-a", "flow-1", { id: 1 }, 100);

    cache.invalidateScopes("project-a", ["summary", "flow"], ["flow-1"]);

    expect(cache.get("summary", "project-a", "root", 1_000, 120)).toEqual({ flows: 2 });
    expect(cache.get("summary", "project-a", "flow-1", 1_000, 120)).toBeUndefined();
    expect(cache.get("flow", "project-a", "flow-1", 1_000, 120)).toBeUndefined();
  });

  it("treats scoped mutation events without resource IDs as non-invalidating", () => {
    const source = readFileSync(new URL("./useAutomationStudioCache.ts", import.meta.url), "utf8");

    expect(source).toContain("detail.cacheScopes?.length && detail.resourceIds?.length");
    expect(source).not.toContain("invalidateScopes(detail.projectId, detail.cacheScopes, detail.resourceIds ?? [])");
  });

  it("reports bounded development ownership by scope without serializing cache payloads", () => {
    const cache = new AutomationStudioDataCache();
    const stringify = vi.spyOn(JSON, "stringify");
    cache.set("summary", "project-a", "root", { runs: 2 });
    cache.set("flow", "project-a", "flow-1", { name: "Build" });
    const stats = cache.stats();
    const stringifyCalls = stringify.mock.calls.length;
    stringify.mockRestore();
    expect(stats).toMatchObject({
      entryCount: 2,
      scopes: { summary: 1, flow: 1 }
    });
    expect(stats.estimatedBytes).toBeGreaterThan(0);
    expect(stringifyCalls).toBe(0);
  });
});
