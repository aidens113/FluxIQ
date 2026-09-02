import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "./project-database.ts";
import { AutomationStudioProjectHierarchyRepository } from "./project-hierarchy-repository.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-project-hierarchy-repository-test");

describe("AutomationStudioProjectHierarchyRepository", () => {
  beforeEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(rootDir, { recursive: true });
  });
  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

  it("persists hierarchy entries with transactional depth, path, and revisions", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const repository = await AutomationStudioProjectHierarchyRepository.open({ pool, projectId: "project.hierarchy" });
    const root = await repository.putEntry({ entryId: "entry.root", parentEntryId: null, kind: "folder", ownerId: "entry.root", displayName: "Root", sortKey: "0", isSystem: true, isDeleted: false, createdAt: 1, updatedAt: 1 });
    const child = await repository.putEntry({ entryId: "entry.child", parentEntryId: root.entryId, kind: "flow", ownerId: "flow.1", displayName: "Child", sortKey: "1", isSystem: false, isDeleted: false, createdAt: 2, updatedAt: 2 });
    expect(child).toMatchObject({ depth: 1, pathKey: "entry.root/entry.child", revision: 1 });
    await expect(repository.putEntry({ ...child, displayName: "Changed" }, 99)).rejects.toThrow(/revision conflict/);
    await expect(repository.listChildren(root.entryId)).resolves.toMatchObject([{ entryId: "entry.child", displayName: "Child" }]);
    await repository.close();
    await pool.closeAll();
  });

  it("stores workspace preferences as revisioned project rows", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const repository = await AutomationStudioProjectHierarchyRepository.open({ pool, projectId: "project.prefs" });
    const first = await repository.setPreference({ userId: "user.1", preferenceKey: "sidebar", value: { expanded: ["entry.root"] }, updatedAt: 1 });
    expect(JSON.parse(first.valueJson)).toEqual({ expanded: ["entry.root"] });
    await expect(repository.setPreference({ userId: "user.1", preferenceKey: "sidebar", value: { expanded: [] } }, 99)).rejects.toThrow(/revision conflict/);
    await expect(repository.setPreference({ userId: "user.1", preferenceKey: "sidebar", value: { expanded: [] } }, first.revision)).resolves.toMatchObject({ revision: 2 });
    await repository.close();
    await pool.closeAll();
  });

  it("imports legacy hierarchy nodes, deleted IDs, and workspace preferences", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const repository = await AutomationStudioProjectHierarchyRepository.open({ pool, projectId: "project.legacy-hierarchy" });
    await expect(repository.importLegacyHierarchy({
      customHierarchyNodes: [
        { id: "entry.folder", label: "Folder", kind: "folder", category: "flow", parentId: null },
        { id: "entry.flow", label: "Flow", kind: "flow", category: "flow", parentId: "entry.folder", sourceId: "flow.1" }
      ],
      deletedHierarchyIds: ["entry.deleted"],
      workspacePrefs: { selectedEntryId: "entry.flow" }
    }, { userId: "user.1", updatedAt: 10 })).resolves.toEqual({ importedEntries: 2, tombstones: 1, preferences: 1 });
    await expect(repository.getEntry("entry.deleted")).resolves.toMatchObject({ isDeleted: true });
    await expect(repository.listChildren("entry.folder")).resolves.toMatchObject([{ ownerId: "flow.1", depth: 1 }]);
    const prefs = await repository.getPreference("user.1", "workspace");
    expect(prefs ? JSON.parse(prefs.valueJson) : null).toEqual({ selectedEntryId: "entry.flow" });
    await repository.close();
    await pool.closeAll();
  });

  it("returns cursor-paged children, ancestors, subtree pages, and search results", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const repository = await AutomationStudioProjectHierarchyRepository.open({ pool, projectId: "project.hierarchy-pages" });
    await repository.putEntry({ entryId: "entry.root", parentEntryId: null, kind: "folder", ownerId: "entry.root", displayName: "Root", sortKey: "0", isSystem: true, isDeleted: false, createdAt: 1, updatedAt: 1 });
    for (let index = 0; index < 5; index += 1) {
      await repository.putEntry({ entryId: `entry.child.${index}`, parentEntryId: "entry.root", kind: "flow", ownerId: `flow.${index}`, displayName: index === 3 ? "Checkout Flow" : `Flow ${index}`, sortKey: index < 3 ? "0" : String(index), isSystem: false, isDeleted: false, createdAt: index + 2, updatedAt: index + 2 });
    }
    await repository.putEntry({ entryId: "entry.grandchild", parentEntryId: "entry.child.3", kind: "run", ownerId: "run.1", displayName: "Grandchild", sortKey: "0", isSystem: false, isDeleted: false, createdAt: 10, updatedAt: 10 });
    const first = await repository.listChildrenPage({ parentEntryId: "entry.root", limit: 2 });
    const second = await repository.listChildrenPage({ parentEntryId: "entry.root", limit: 2, cursor: first.nextCursor });
    expect(first.items.map((entry) => entry.entryId)).toEqual(["entry.child.0", "entry.child.1"]);
    expect(second.items.map((entry) => entry.entryId)).toEqual(["entry.child.2", "entry.child.3"]);
    await expect(repository.listAncestors("entry.grandchild")).resolves.toMatchObject([{ entryId: "entry.root" }, { entryId: "entry.child.3" }]);
    const subtree = await repository.listSubtreePage({ rootEntryId: "entry.child.3", limit: 10 });
    expect(subtree.items.map((entry) => entry.entryId)).toEqual(["entry.child.3", "entry.grandchild"]);
    await expect(repository.search({ query: "Checkout", limit: 5 })).resolves.toMatchObject([{ entryId: "entry.child.3" }]);
    await repository.close();
    await pool.closeAll();
  });
});
