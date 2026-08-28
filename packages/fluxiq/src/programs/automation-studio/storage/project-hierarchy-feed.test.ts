import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "./project-database.ts";
import { AutomationStudioProjectHierarchyFeed } from "./project-hierarchy-feed.ts";
import { AutomationStudioProjectHierarchyMutations } from "./project-hierarchy-mutations.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-project-hierarchy-feed-test");

describe("AutomationStudioProjectHierarchyFeed", () => {
  beforeEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(rootDir, { recursive: true });
  });
  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

  it("returns targeted create and rename cache updates by feed sequence", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const mutations = await AutomationStudioProjectHierarchyMutations.open({ pool, projectId: "project.feed" });
    const feed = await AutomationStudioProjectHierarchyFeed.open({ pool, projectId: "project.feed" });
    try {
      const created = await mutations.createEntry({ mutationId: "m.create", entryId: "entry.root", parentEntryId: null, kind: "folder", ownerId: "entry.root", displayName: "Root", sortKey: "0", changedAt: 1 });
      const createdUpdates = await feed.listUpdatesAfter({ afterSequence: 0, limit: 10 });
      expect(createdUpdates).toMatchObject({ hasMore: false });
      expect(createdUpdates.updates).toHaveLength(1);
      expect(createdUpdates.updates[0]).toMatchObject({ operation: "create", entryId: "entry.root", invalidateParentEntryIds: [null], deletedEntryIds: [], invalidateSubtreeEntryIds: [] });
      expect(createdUpdates.updates[0]?.entry).toMatchObject({ displayName: "Root", revision: 1 });

      await mutations.renameEntry({ mutationId: "m.rename", entryId: "entry.root", displayName: "Renamed", expectedRevision: created.response.revision, changedAt: 2 });
      const renamedUpdates = await feed.listUpdatesAfter({ afterSequence: createdUpdates.nextSequence, limit: 10 });
      expect(renamedUpdates.updates).toHaveLength(1);
      expect(renamedUpdates.updates[0]).toMatchObject({ operation: "update", entryId: "entry.root", invalidateParentEntryIds: [null], deletedEntryIds: [], invalidateSubtreeEntryIds: [] });
      expect(renamedUpdates.updates[0]?.entry).toMatchObject({ displayName: "Renamed", revision: 2 });
    } finally {
      await feed.close();
      await mutations.close();
      await pool.closeAll();
    }
  });

  it("returns parent and subtree invalidations for move and delete operations", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const mutations = await AutomationStudioProjectHierarchyMutations.open({ pool, projectId: "project.feed.move" });
    const feed = await AutomationStudioProjectHierarchyFeed.open({ pool, projectId: "project.feed.move" });
    try {
      await mutations.createEntry({ mutationId: "m.root", entryId: "entry.root", parentEntryId: null, kind: "folder", ownerId: "entry.root", displayName: "Root", sortKey: "0", changedAt: 1 });
      await mutations.createEntry({ mutationId: "m.other", entryId: "entry.other", parentEntryId: null, kind: "folder", ownerId: "entry.other", displayName: "Other", sortKey: "1", changedAt: 2 });
      const child = await mutations.createEntry({ mutationId: "m.child", entryId: "entry.child", parentEntryId: "entry.root", kind: "flow", ownerId: "flow.1", displayName: "Child", sortKey: "0", changedAt: 3 });
      await mutations.createEntry({ mutationId: "m.grandchild", entryId: "entry.grandchild", parentEntryId: "entry.child", kind: "run", ownerId: "run.1", displayName: "Grand", sortKey: "0", changedAt: 4 });
      const initial = await feed.listUpdatesAfter({ afterSequence: 0, limit: 10 });

      const moved = await mutations.moveSubtree({ mutationId: "m.move", entryId: "entry.child", newParentEntryId: "entry.other", expectedRevision: child.response.revision, changedAt: 5 });
      const moveUpdates = await feed.listUpdatesAfter({ afterSequence: initial.nextSequence, limit: 10 });
      expect(moveUpdates.updates).toHaveLength(1);
      expect(moveUpdates.updates[0]?.entry).toMatchObject({ entryId: "entry.child", parentEntryId: "entry.other", pathKey: "entry.other/entry.child" });
      expect(moveUpdates.updates[0]?.invalidateParentEntryIds).toEqual(["entry.other", "entry.root"]);
      expect(moveUpdates.updates[0]?.invalidateSubtreeEntryIds).toEqual(["entry.child"]);

      await mutations.deleteSubtree({ mutationId: "m.delete", entryId: "entry.child", expectedRevision: moved.response.revision, changedAt: 6 });
      const deleteUpdates = await feed.listUpdatesAfter({ afterSequence: moveUpdates.nextSequence, limit: 10 });
      expect(deleteUpdates.updates).toHaveLength(1);
      expect(deleteUpdates.updates[0]).toMatchObject({ operation: "delete", entryId: "entry.child", entry: null, invalidateParentEntryIds: ["entry.other"], invalidateSubtreeEntryIds: ["entry.child"] });
      expect(deleteUpdates.updates[0]?.deletedEntryIds).toEqual(["entry.child", "entry.grandchild"]);
    } finally {
      await feed.close();
      await mutations.close();
      await pool.closeAll();
    }
  });
});
