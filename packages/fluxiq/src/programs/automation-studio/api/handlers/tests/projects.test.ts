// Covers handlers/projects.ts: its hierarchy pages, change feed, and the
// dedicated Problems paging contract.

import { writeFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { GlobalProgramApiRegistry } from "../../../../_shared/api.ts";

import { AUTOMATION_STUDIO_ENDPOINTS } from "../../contracts.ts";
import { cacheActor } from "./test-actor.ts";
import { createCacheApiTestService } from "./test-service.ts";
import { registerAutomationStudioApi } from "../index.ts";

describe("Automation Studio hierarchy page API", () => {
  it("registers bounded hierarchy mutations and preserves unrelated hierarchy state", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    try {
      const project = await service.createProject({ name: "Bounded hierarchy mutations" });
      await service.saveProjectHierarchy(project.id, {
        customHierarchyNodes: [
          { id: "folder.root", label: "Root", kind: "folder", category: "flow", parentId: null },
          { id: "folder.child", label: "Child", kind: "folder", category: "flow", parentId: "folder.root" },
          { id: "folder.sibling", label: "Sibling", kind: "folder", category: "flow", parentId: null }
        ],
        deletedHierarchyIds: ["folder.previously-deleted"],
        workspacePrefs: { mainLayoutPreset: "single" }
      });
      const registry = new GlobalProgramApiRegistry();
      registerAutomationStudioApi(registry, service);

      expect(AUTOMATION_STUDIO_ENDPOINTS.putProjectHierarchyNode).toBe("put-project-hierarchy-node");
      expect(AUTOMATION_STUDIO_ENDPOINTS.deleteProjectHierarchyNode).toBe("delete-project-hierarchy-node");
      expect(registry.endpoints()).toEqual(expect.arrayContaining([
        { programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.putProjectHierarchyNode, permission: "programs.write" },
        { programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteProjectHierarchyNode, permission: "programs.write" }
      ]));

      const put = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.putProjectHierarchyNode,
        scope: {},
        actor: cacheActor("user.hierarchy"),
        payload: {
          projectId: project.id,
          mutationId: "hierarchy.put.root",
          node: { id: "folder.root", label: "Root renamed", kind: "folder", category: "flow", parentId: null }
        }
      });
      expect(put).toMatchObject({ ok: true, payload: { nodeId: "folder.root" } });
      expect(await service.getProjectHierarchy(project.id)).toEqual({
        customHierarchyNodes: [
          { id: "folder.root", label: "Root renamed", kind: "folder", category: "flow", parentId: null },
          { id: "folder.child", label: "Child", kind: "folder", category: "flow", parentId: "folder.root" },
          { id: "folder.sibling", label: "Sibling", kind: "folder", category: "flow", parentId: null }
        ],
        deletedHierarchyIds: ["folder.previously-deleted"],
        workspacePrefs: { mainLayoutPreset: "single" }
      });

      const deleted = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteProjectHierarchyNode,
        scope: {},
        actor: cacheActor("user.hierarchy"),
        payload: { projectId: project.id, nodeId: "folder.root", mutationId: "hierarchy.delete.root" }
      });
      expect(deleted).toMatchObject({ ok: true, payload: { nodeId: "folder.root", deletedCount: 2 } });
      expect(await service.getProjectHierarchy(project.id)).toEqual({
        customHierarchyNodes: [
          { id: "folder.sibling", label: "Sibling", kind: "folder", category: "flow", parentId: null }
        ],
        deletedHierarchyIds: ["folder.previously-deleted", "folder.root", "folder.child"],
        workspacePrefs: { mainLayoutPreset: "single" }
      });

      const malformed = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.putProjectHierarchyNode,
        scope: {},
        actor: cacheActor("user.hierarchy"),
        payload: { projectId: project.id, node: { id: "", label: "Broken", kind: "folder", category: "flow", parentId: null } }
      });
      expect(malformed.ok).toBe(false);
      expect(malformed.error).toContain("node.id is required");
    } finally {
      await cleanup();
    }
  });

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
