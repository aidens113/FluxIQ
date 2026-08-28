import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "./project-database.ts";
import { AutomationStudioProjectHierarchyMutations } from "./project-hierarchy-mutations.ts";
import { AutomationStudioProjectHierarchyRepository } from "./project-hierarchy-repository.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-project-hierarchy-mutations-test");

describe("AutomationStudioProjectHierarchyMutations", () => {
  beforeEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(rootDir, { recursive: true });
  });
  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

  it("creates and renames entries as idempotent mutation deltas", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const mutations = await AutomationStudioProjectHierarchyMutations.open({ pool, projectId: "project.atomic" });
    const created = await mutations.createEntry({ mutationId: "mutation.create", entryId: "entry.root", parentEntryId: null, kind: "folder", ownerId: "entry.root", displayName: "Root", sortKey: "0", isSystem: true, changedAt: 1 });
    await expect(mutations.createEntry({ mutationId: "mutation.create", entryId: "entry.root", parentEntryId: null, kind: "folder", ownerId: "entry.root", displayName: "Root", sortKey: "0", isSystem: true, changedAt: 2 })).resolves.toMatchObject({ replayed: true, response: { entryId: "entry.root" } });
    const renamed = await mutations.renameEntry({ mutationId: "mutation.rename", entryId: "entry.root", displayName: "Renamed", expectedRevision: created.response.revision, changedAt: 3 });
    expect(renamed.response).toMatchObject({ displayName: "Renamed", revision: 2 });
    await mutations.close();
    await pool.closeAll();
  });

  it("moves and deletes subtrees without whole-tree saves", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const mutations = await AutomationStudioProjectHierarchyMutations.open({ pool, projectId: "project.move" });
    await mutations.createEntry({ mutationId: "m.root", entryId: "entry.root", parentEntryId: null, kind: "folder", ownerId: "entry.root", displayName: "Root", sortKey: "0", changedAt: 1 });
    await mutations.createEntry({ mutationId: "m.other", entryId: "entry.other", parentEntryId: null, kind: "folder", ownerId: "entry.other", displayName: "Other", sortKey: "1", changedAt: 2 });
    const child = await mutations.createEntry({ mutationId: "m.child", entryId: "entry.child", parentEntryId: "entry.root", kind: "flow", ownerId: "flow.1", displayName: "Child", sortKey: "0", changedAt: 3 });
    await mutations.createEntry({ mutationId: "m.grandchild", entryId: "entry.grandchild", parentEntryId: "entry.child", kind: "run", ownerId: "run.1", displayName: "Grand", sortKey: "0", changedAt: 4 });
    const moved = await mutations.moveSubtree({ mutationId: "m.move", entryId: "entry.child", newParentEntryId: "entry.other", expectedRevision: child.response.revision, changedAt: 5 });
    expect(moved.response).toMatchObject({ parentEntryId: "entry.other", pathKey: "entry.other/entry.child" });
    const repository = await AutomationStudioProjectHierarchyRepository.open({ pool, projectId: "project.move" });
    await expect(repository.getEntry("entry.grandchild")).resolves.toMatchObject({ pathKey: "entry.other/entry.child/entry.grandchild" });
    const deleted = await mutations.deleteSubtree({ mutationId: "m.delete", entryId: "entry.child", expectedRevision: moved.response.revision, changedAt: 6 });
    expect(deleted.response.deletedEntryIds).toEqual(["entry.grandchild", "entry.child"]);
    await expect(repository.search({ query: "Child" })).resolves.toEqual([]);
    await repository.close();
    await mutations.close();
    await pool.closeAll();
  });
});

