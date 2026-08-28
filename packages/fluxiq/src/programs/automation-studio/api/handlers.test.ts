import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../_shared/api.ts";
import { AutomationStudioService } from "../runtime/service.ts";

import { AUTOMATION_STUDIO_ENDPOINTS, AUTOMATION_STUDIO_NORMAL_EDITOR_GRAPH_WRITE_ENDPOINT, assertAutomationStudioNormalEditorGraphEndpoint } from "./contracts.ts";
import { flowInstructionScopeFromPayload, registerAutomationStudioApi } from "./handlers.ts";

const base = { projectId: "project.one", flowId: "flow.one", title: "Rule", body: "Apply it" };

describe("flowInstructionScopeFromPayload", () => {
  it("exposes a bounded development performance snapshot endpoint", () => {
    expect(AUTOMATION_STUDIO_ENDPOINTS.performanceMetrics).toBe("get-performance-metrics");
  });
  it("exposes graph patch endpoints as the normal editor write API", () => {
    expect(AUTOMATION_STUDIO_ENDPOINTS.getGraphViewport).toBe("get-graph-viewport");
    expect(AUTOMATION_STUDIO_ENDPOINTS.applyGraphPatch).toBe("apply-graph-patch");
    expect(AUTOMATION_STUDIO_ENDPOINTS.listGraphRevisions).toBe("list-graph-revisions");
    expect(AUTOMATION_STUDIO_ENDPOINTS.createGraphSnapshot).toBe("create-graph-snapshot");
    expect(AUTOMATION_STUDIO_ENDPOINTS.restoreGraphSnapshot).toBe("restore-graph-snapshot");
    expect(AUTOMATION_STUDIO_NORMAL_EDITOR_GRAPH_WRITE_ENDPOINT).toBe(AUTOMATION_STUDIO_ENDPOINTS.applyGraphPatch);
    expect(() => assertAutomationStudioNormalEditorGraphEndpoint(AUTOMATION_STUDIO_ENDPOINTS.saveFlow)).toThrow(/full Flow document/);
    expect(() => assertAutomationStudioNormalEditorGraphEndpoint(AUTOMATION_STUDIO_ENDPOINTS.applyGraphPatch)).not.toThrow();
  });
  it("exposes a cursor-based project change-feed endpoint for browser sync", () => {
    expect(AUTOMATION_STUDIO_ENDPOINTS.listProjectChangeFeed).toBe("list-project-change-feed");
  });
  it("exposes ordered runtime event pages for Runtime Debug", () => {
    expect(AUTOMATION_STUDIO_ENDPOINTS.listFlowRunEvents).toBe("list-flow-run-events");
  });
  it("preserves global and project scopes", () => {
    expect(flowInstructionScopeFromPayload("project.one", "flow.one", { ...base, scopeKind: "global" })).toEqual({ kind: "global" });
    expect(flowInstructionScopeFromPayload("project.one", "flow.one", { ...base, scopeKind: "project" })).toEqual({ kind: "project", projectId: "project.one" });
  });

  it("preserves named Router, Subflow, node, error, and review targets", () => {
    expect(flowInstructionScopeFromPayload("project.one", "flow.one", { ...base, scopeKind: "router", routerId: "router.one" })).toMatchObject({ kind: "router", routerId: "router.one" });
    expect(flowInstructionScopeFromPayload("project.one", "flow.one", { ...base, scopeKind: "subflow", subflowId: "subflow.one" })).toMatchObject({ kind: "subflow", subflowId: "subflow.one" });
    expect(flowInstructionScopeFromPayload("project.one", "flow.one", { ...base, scopeKind: "node", nodeId: "node.one", subflowId: "subflow.one" })).toMatchObject({ kind: "node", nodeId: "node.one", subflowId: "subflow.one" });
    expect(flowInstructionScopeFromPayload("project.one", "flow.one", { ...base, scopeKind: "on_error", nodeId: "node.one" })).toMatchObject({ kind: "on_error", nodeId: "node.one" });
    expect(flowInstructionScopeFromPayload("project.one", "flow.one", { ...base, scopeKind: "adaptation_review", subflowId: "subflow.one" })).toMatchObject({ kind: "adaptation_review", subflowId: "subflow.one" });
  });
});


async function createCacheApiTestService(): Promise<{ service: AutomationStudioService; cleanup: () => Promise<void> }> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-automation-cache-api-"));
  const service = new AutomationStudioService({ dataDir: path.join(rootDir, ".fluxiq", "data"), seedFixture: false });
  return {
    service,
    cleanup: async () => {
      await service.close();
      await rm(rootDir, { recursive: true, force: true });
    }
  };
}
const cacheActor = (userId: string): ProgramApiActor => ({
  sessionId: `session.${userId}`,
  userId,
  roleId: "admin",
  permissions: ["programs.read", "programs.write"]
});

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
