// Covers handlers/caches.ts.

import { describe, expect, it } from "vitest";

import { GlobalProgramApiRegistry } from "../../../../_shared/api.ts";

import { AUTOMATION_STUDIO_ENDPOINTS } from "../../contracts.ts";
import { cacheActor } from "./test-actor.ts";
import { createCacheApiTestService } from "./test-service.ts";
import { registerAutomationStudioApi } from "../index.ts";

describe("Automation Studio project UI cache API", () => {
  it("persists cache entries by authenticated user and project scope", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    try {
      const project = await service.createProject({ name: "Cache API" });
      const registry = new GlobalProgramApiRegistry();
      registerAutomationStudioApi(registry, service);

      const save = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.saveProjectUiCache,
        scope: {},
        actor: cacheActor("user.one"),
        payload: { projectId: project.id, entries: [{ cacheKey: "workspace:layout", value: { activeViewId: "router" }, contentRevision: 4 }] }
      });
      expect(save.ok).toBe(true);
      expect(save.payload).toMatchObject({ entries: [{ cacheKey: "workspace:layout", contentRevision: 4 }] });

      const isolated = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.getProjectUiCache,
        scope: {},
        actor: cacheActor("user.two"),
        payload: { projectId: project.id, cacheKeys: ["workspace:layout"] }
      });
      expect(isolated.payload).toEqual({ entries: [], missingKeys: ["workspace:layout"] });

      const loaded = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.getProjectUiCache,
        scope: {},
        actor: cacheActor("user.one"),
        payload: { projectId: project.id, cacheKeys: ["workspace:layout", "sidebar:tree"] }
      });
      expect(loaded.payload).toMatchObject({
        entries: [{ cacheKey: "workspace:layout", value: { activeViewId: "router" } }],
        missingKeys: ["sidebar:tree"]
      });

      const stats = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.listProjectUiCacheStats,
        scope: {},
        actor: cacheActor("user.one"),
        payload: { projectId: project.id }
      });
      expect(stats.ok).toBe(true);
      const statsPayload = stats.payload as { stats: Array<{ projectId: string; entries: number }> };
      expect(statsPayload.stats).toHaveLength(1);
      expect(statsPayload.stats[0]).toBeDefined();
      expect(statsPayload.stats[0]!.projectId).toBe(project.id);
      expect(statsPayload.stats[0]!.entries).toBe(1);

      const deleted = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteProjectUiCache,
        scope: {},
        actor: cacheActor("user.one"),
        payload: { projectId: project.id, cacheKeys: ["workspace:layout"] }
      });
      expect(deleted.payload).toEqual({ deleted: 1 });
    } finally {
      await cleanup();
    }
  });


  it("clears rebuildable cache when a project is deleted", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    try {
      const project = await service.createProject({ name: "Cache Delete" });
      await service.saveProjectUiCache({ projectId: project.id, userId: "user.one", entries: [{ cacheKey: "workspace:layout", value: { activeViewId: "router" } }] });
      await expect(service.listProjectUiCacheStats({ userId: "user.one" })).resolves.toMatchObject({ stats: [{ projectId: project.id, entryCount: 1 }] });
      await service.deleteProject(project.id);
      await expect(service.listProjectUiCacheStats({ userId: "user.one" })).resolves.toEqual({ stats: [] });
    } finally {
      await cleanup();
    }
  });
  it("rejects cache batches above the server limit", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    try {
      const project = await service.createProject({ name: "Cache Limits" });
      const registry = new GlobalProgramApiRegistry();
      registerAutomationStudioApi(registry, service);

      const response = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.saveProjectUiCache,
        scope: {},
        actor: cacheActor("user.one"),
        payload: {
          projectId: project.id,
          entries: Array.from({ length: 101 }, (_, index) => ({ cacheKey: `key:${index}`, value: index }))
        }
      });

      expect(response.ok).toBe(false);
      expect(response.error).toContain("at most 100 entries");
    } finally {
      await cleanup();
    }
  });
});
