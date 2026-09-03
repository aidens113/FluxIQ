import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../_shared/api.ts";
import { AutomationStudioService } from "../runtime/service.ts";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService } from "../../../client-gateway/index.ts";

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
  it("exposes cursor-based hierarchy and project change-feed endpoints", () => {
    expect(AUTOMATION_STUDIO_ENDPOINTS.listProjectHierarchyChildren).toBe("list-project-hierarchy-children");
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


async function createCacheApiTestService(): Promise<{ service: AutomationStudioService; dataDir: string; cleanup: () => Promise<void> }> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-automation-cache-api-"));
  const dataDir = path.join(rootDir, ".fluxiq", "data");
  const service = new AutomationStudioService({ dataDir, seedFixture: false });
  return {
    service,
    dataDir,
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

describe("Automation Studio graph patch API", () => {
  it("registers the editor mutation endpoint and persists its bounded graph operations", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    try {
      const project = await service.createProject({ name: "Graph patch API" });
      const flow = await service.createFlow({ projectId: project.id, name: "Patched Flow" });
      const registry = new GlobalProgramApiRegistry();
      const authorizeSessionPin = vi.fn().mockResolvedValue({ authorized: true });
      registerAutomationStudioApi(registry, service, { authorizeSessionPin } as any);
      expect(registry.endpoints()).toContainEqual({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.applyGraphPatch,
        permission: "flows.write"
      });
      expect(registry.endpoints()).toContainEqual({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.getGraphViewport,
        permission: "programs.read"
      });

      const response = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.applyGraphPatch,
        scope: {},
        actor: { ...cacheActor("user.graph"), permissions: ["programs.read", "programs.write", "flows.write"] },
        payload: {
          projectId: project.id,
          flowId: flow.flowId,
          authSessionId: "session.user.graph",
          authorizationPin: "123456",
          baseRevision: 1,
          mutationId: "graph-api.initial",
          operations: [
            {
              op: "add_node",
              node: {
                nodeId: "node.start",
                flowId: flow.flowId,
                definitionId: "builtin.control.start",
                definitionVersion: "1.0.0",
                label: "Start",
                description: "",
                x: 0,
                y: 0,
                width: 320,
                height: 180,
                zIndex: 0,
                disabled: false,
                parameterValues: {},
                metadata: {}
              }
            },
            {
              op: "add_node",
              node: {
                nodeId: "node.end",
                flowId: flow.flowId,
                definitionId: "builtin.control.end",
                definitionVersion: "1.0.0",
                label: "End",
                description: "",
                x: 420,
                y: 0,
                width: 320,
                height: 180,
                zIndex: 0,
                disabled: false,
                parameterValues: {},
                metadata: {}
              }
            },
            {
              op: "add_edge",
              edge: {
                edgeId: "edge.start.end",
                flowId: flow.flowId,
                sourceNodeId: "node.start",
                targetNodeId: "node.end",
                sourcePortId: "success",
                targetPortId: "in",
                label: "Next",
                metadata: {}
              }
            }
          ]
        }
      });

      expect(response.ok, response.error).toBe(true);
      expect(response).toMatchObject({
        ok: true,
        payload: {
          result: { status: "applied", baseRevision: 1, revisionNumber: 2 },
          replayed: false,
          flow: { flowId: flow.flowId, graphRevision: 2 }
        }
      });
      expect(authorizeSessionPin).toHaveBeenCalledWith({ sessionId: "session.user.graph", pin: "123456" });
      const saved = await service.getFlow(project.id, flow.flowId);
      expect(saved.nodes.map((node) => node.id).sort()).toEqual(["node.end", "node.start"]);
      expect(saved.edges.map((edge) => edge.id)).toEqual(["edge.start.end"]);
      expect(saved.metadata?.graphRevision).toBe(2);
      const viewport = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.getGraphViewport,
        scope: {},
        actor: cacheActor("user.graph"),
        payload: {
          projectId: project.id,
          flowId: flow.flowId,
          bounds: { minX: -100, minY: -100, maxX: 1_000, maxY: 1_000 },
          limit: 500
        }
      });
      expect(viewport).toMatchObject({
        ok: true,
        payload: {
          flow: { flowId: flow.flowId, nodes: [], edges: [], metadata: { graphRevision: 2 } },
          page: { graphRevision: 2, hasMore: false, nodes: [{ nodeId: "node.end" }, { nodeId: "node.start" }], edges: [{ edgeId: "edge.start.end" }] }
        }
      });
    } finally {
      await cleanup();
    }
  });
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

describe("Automation Studio hierarchy page API", () => {
  it("imports legacy hierarchy once and returns stable SQL sibling pages", async () => {
    const { service, dataDir, cleanup } = await createCacheApiTestService();
    try {
      const project = await service.createProject({ name: "Hierarchy pages" });
      await service.saveProjectHierarchy(project.id, {
        customHierarchyNodes: [
          { id: "folder.a", label: "Alpha", kind: "folder", category: "flow", parentId: null },
          { id: "folder.b", label: "Beta", kind: "folder", category: "flow", parentId: null },
          { id: "folder.c", label: "Charlie", kind: "folder", category: "flow", parentId: null }
        ],
        deletedHierarchyIds: [],
        workspacePrefs: {}
      });
      const registry = new GlobalProgramApiRegistry();
      registerAutomationStudioApi(registry, service);

      const first = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.listProjectHierarchyChildren,
        scope: {},
        actor: cacheActor("user.one"),
        payload: { projectId: project.id, parentId: null, limit: 2 }
      });
      expect(first.ok).toBe(true);
      const firstPage = (first.payload as { page: { items: Array<{ entryId: string }>; nextCursor: string | null; hasMore: boolean } }).page;
      expect(firstPage.items.map((item) => item.entryId)).toEqual(["folder.a", "folder.b"]);
      expect(firstPage.hasMore).toBe(true);
      expect(firstPage.nextCursor).toBeTypeOf("string");

      await writeFile(
        path.join(dataDir, "programs", "automation-studio", "projects", project.id, "hierarchy", "nodes.json"),
        "legacy hierarchy must not be parsed after SQL cutover",
        "utf8"
      );

      const second = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.listProjectHierarchyChildren,
        scope: {},
        actor: cacheActor("user.one"),
        payload: { projectId: project.id, parentId: null, cursor: firstPage.nextCursor, limit: 2 }
      });
      expect((second.payload as { page: { items: Array<{ entryId: string }>; hasMore: boolean } }).page).toMatchObject({
        items: [{ entryId: "folder.c" }],
        hasMore: false
      });

      const emptyFolder = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.listProjectHierarchyChildren,
        scope: {},
        actor: cacheActor("user.one"),
        payload: { projectId: project.id, parentId: "folder.a", limit: 2 }
      });
      expect(emptyFolder).toMatchObject({
        ok: true,
        payload: { page: { items: [], nextCursor: null, hasMore: false } }
      });
    } finally {
      await cleanup();
    }
  });
});

describe("Automation Studio Client Gateway paging API", () => {
  it("returns summary counts and opaque stable pages capped by the handler", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    const gateway = new ClientGatewayService();
    try {
      for (let index = 0; index < 125; index += 1) {
        const session = gateway.connect();
        await gateway.receive(session.sessionId, {
          protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION,
          id: `message.${index}`,
          type: "client.hello",
          timestamp: index + 1,
          payload: { clientId: `client-${String(index).padStart(4, "0")}`, clientType: "extension", name: `Client ${String(index).padStart(4, "0")}` }
        });
      }
      const registry = new GlobalProgramApiRegistry();
      registerAutomationStudioApi(registry, service, undefined, undefined, gateway);
      const snapshot = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.clientGatewaySnapshot, scope: {}, actor: cacheActor("user.gateway"), payload: {} });
      expect(snapshot.payload).toMatchObject({ counts: { sessions: 125, pairings: 125, trustedClients: 0 }, sessions: [], pairings: [], trustedClients: [] });

      const first = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.listClientGatewayItems, scope: {}, actor: cacheActor("user.gateway"), payload: { kind: "sessions", limit: 500 } });
      const firstPayload = first.payload as { items: Array<{ sessionId: string }>; page: { total: number; limit: number; nextCursor: string | null; hasMore: boolean } };
      expect(firstPayload.page).toMatchObject({ total: 125, limit: 200, hasMore: false });
      expect(firstPayload.items).toHaveLength(125);

      const pageOne = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.listClientGatewayItems, scope: {}, actor: cacheActor("user.gateway"), payload: { kind: "sessions", limit: 50 } });
      const one = pageOne.payload as typeof firstPayload;
      expect(one).toMatchObject({ page: { total: 125, limit: 50, hasMore: true } });
      expect(one.items).toHaveLength(50);
      const pageTwo = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.listClientGatewayItems, scope: {}, actor: cacheActor("user.gateway"), payload: { kind: "sessions", limit: 50, cursor: one.page.nextCursor } });
      const two = pageTwo.payload as typeof firstPayload;
      expect(two.items).toHaveLength(50);
      expect(new Set([...one.items, ...two.items].map((item) => item.sessionId)).size).toBe(100);

      const mismatched = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.listClientGatewayItems, scope: {}, actor: cacheActor("user.gateway"), payload: { kind: "sessions", limit: 50, search: "changed", cursor: one.page.nextCursor } });
      expect(mismatched).toMatchObject({ ok: false, error: expect.stringMatching(/does not match/) });
    } finally {
      await cleanup();
    }
  });
});

describe("Automation Studio Problems paging API", () => {
  it("pages through the dedicated service contract without hydrating the broad snapshot", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    try {
      const project = await service.createProject({ name: "Problem pages" });
      const snapshot = vi.spyOn(service, "snapshot").mockRejectedValue(new Error("broad snapshot must not be used"));
      const registry = new GlobalProgramApiRegistry();
      registerAutomationStudioApi(registry, service);

      const response = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.listProjectProblems,
        scope: {},
        actor: cacheActor("user.problems"),
        payload: { projectId: project.id, status: "all", limit: 25 }
      });
      expect(response).toMatchObject({
        ok: true,
        payload: {
          problems: [{ id: "automation-studio.host-artifacts" }],
          page: { total: 1, limit: 25, hasMore: false, nextCursor: null }
        }
      });
      expect(snapshot).not.toHaveBeenCalled();

      const invalid = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.listProjectProblems,
        scope: {},
        actor: cacheActor("user.problems"),
        payload: { projectId: project.id, severity: "critical" }
      });
      expect(invalid).toMatchObject({ ok: false, error: expect.stringMatching(/severity filter/) });
    } finally {
      await cleanup();
    }
  });
});

describe("Automation Studio Router target-reference API", () => {
  it("forwards a bounded Subflow batch and returns compact references", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    try {
      const listReferences = vi.spyOn(service, "listFlowRouterTargetReferences").mockResolvedValue({
        perTargetLimit: 20,
        targets: [{ subflowId: "subflow.one", total: 1, hasMore: false, references: [{ id: "route.one", kind: "route", name: "One", status: "active", order: 1, conditionLabel: "Always" }] }]
      });
      const registry = new GlobalProgramApiRegistry();
      registerAutomationStudioApi(registry, service);
      const response = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowRouterTargetReferences,
        scope: {},
        actor: cacheActor("user.router-references"),
        payload: { projectId: "project.one", flowId: "flow.one", subflowIds: ["subflow.one"], perTargetLimit: 20 }
      });
      expect(listReferences).toHaveBeenCalledWith({ projectId: "project.one", flowId: "flow.one", subflowIds: ["subflow.one"], perTargetLimit: 20 });
      expect(response).toMatchObject({ ok: true, payload: { targets: [{ subflowId: "subflow.one", total: 1 }], batch: { perTargetLimit: 20 } } });
    } finally {
      await cleanup();
    }
  });
});
