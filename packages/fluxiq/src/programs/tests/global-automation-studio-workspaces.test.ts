// Legacy Automation Studio project workspaces, as the global runtime finds them on disk.

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { AutomationStudioService } from "../automation-studio/index.ts";

describe("global program services", () => {
  it("creates only populated documents in legacy folder-backed project workspaces", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-automation-folders-"));
    try {
      const dataDir = path.join(root, ".fluxiq", "data");
      const service = new AutomationStudioService({ dataDir, seedFixture: false });
      const project = await service.createProject({ name: "Folder Project", description: "Uses folders" });
      await service.saveProjectHierarchy(project.id, {
        customHierarchyNodes: [{ id: "folder-1", label: "Ops", kind: "folder", category: "task", parentId: null }],
        deletedHierarchyIds: ["old-node"],
        workspacePrefs: { sidebarWidth: 300 }
      });

      const projectRoot = path.join(dataDir, "programs", "automation-studio", "projects", project.id);
      const index = JSON.parse(await readFile(path.join(dataDir, "programs", "automation-studio", "projects", "index.json"), "utf8"));
      const manifest = JSON.parse(await readFile(path.join(projectRoot, "manifest.json"), "utf8"));
      const nodes = JSON.parse(await readFile(path.join(projectRoot, "hierarchy", "nodes.json"), "utf8"));
      const deleted = JSON.parse(await readFile(path.join(projectRoot, "hierarchy", "deleted.json"), "utf8"));
      const prefs = JSON.parse(await readFile(path.join(projectRoot, "workspace", "preferences.json"), "utf8"));

      expect(index.data.projects).toContainEqual(expect.objectContaining({ id: project.id, name: "Folder Project" }));
      expect(manifest.data).toMatchObject({ id: project.id, name: "Folder Project" });
      expect(nodes.data.customHierarchyNodes).toHaveLength(1);
      expect(deleted.data.deletedHierarchyIds).toEqual(["old-node"]);
      expect(prefs.data.workspacePrefs).toMatchObject({ sidebarWidth: 300 });
      await expect(stat(path.join(projectRoot, "recordings"))).rejects.toMatchObject({ code: "ENOENT" });
      await expect(stat(path.join(projectRoot, "custom-nodes"))).rejects.toMatchObject({ code: "ENOENT" });
      await expect(stat(path.join(projectRoot, "artifacts"))).rejects.toMatchObject({ code: "ENOENT" });
      await expect(stat(path.join(dataDir, "programs", "automation-studio", "nodes"))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("migrates legacy Automation Studio projects.json into project folders", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-automation-legacy-projects-"));
    try {
      const dataDir = path.join(root, ".fluxiq", "data");
      const legacyPath = path.join(dataDir, "programs", "automation-studio", "projects.json");
      await mkdir(path.dirname(legacyPath), { recursive: true });
      await writeFile(legacyPath, `${JSON.stringify({
        version: 1,
        data: {
          categories: [{ id: "cat-1", name: "Legacy", order: 0, createdAt: 1, updatedAt: 1 }],
          projects: [{
            id: "legacy-project",
            name: "Legacy Project",
            description: "Old storage",
            categoryId: "cat-1",
            createdAt: 1,
            updatedAt: 2,
            customHierarchyNodes: [{ id: "routine-1", label: "Routine", kind: "routine", category: "routine", parentId: null }],
            deletedHierarchyIds: ["deleted-1"],
            workspacePrefs: { windowsPerRow: 3 }
          }]
        }
      }, null, 2)}\n`, "utf8");

      const service = new AutomationStudioService({ dataDir, seedFixture: false });
      await expect(service.listProjects()).resolves.toMatchObject({
        categories: [{ id: "cat-1", name: "Legacy" }],
        projects: [{ id: "legacy-project", name: "Legacy Project" }]
      });
      await expect(service.getProjectHierarchy("legacy-project")).resolves.toMatchObject({
        customHierarchyNodes: [{ id: "routine-1" }],
        deletedHierarchyIds: ["deleted-1"],
        workspacePrefs: { windowsPerRow: 3 }
      });
      await expect(readFile(path.join(dataDir, "programs", "automation-studio", "projects", "legacy-project", "manifest.json"), "utf8")).resolves.toContain("Legacy Project");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

});
