// @fluxiq-test-group real-sql
// A writer racing a removal never loses a content file (t747). Each case stops
// one side at a seam between its steps and runs the other side there, on real
// SQLite and real files:
//  - a sweep that runs while a writer holds the object it is about to reference;
//  - a release of the object a writer resolved (plain, and a sealed object the
//    writer reuses through its keyed address) before the writer's reference;
//  - a drain, in another connection standing for another process, that has
//    found a pending file unheld when a writer stores the same bytes again.
// Every case ends with the writer's reference naming an object row whose file
// is on disk and reads back exactly.
import { stat } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectObjectRepository } from "../../object-repository.ts";
import { hostProtection, makeTempRoot } from "./keyring-fixture.ts";
import { openStore, referenceCount, withDatabase, type OpenedStore, type StoreSeams } from "./object-address-fixture.ts";

let root: Awaited<ReturnType<typeof makeTempRoot>>;
const opened: OpenedStore[] = [];

beforeEach(async () => {
  root = await makeTempRoot();
});
afterEach(async () => {
  for (const store of opened.splice(0)) await store.close();
  await root.remove();
});

const PROJECT = "project.races";
const owner = { ownerKind: "test_owner", ownerId: "writer", purpose: "payload" };

/** A seam that does nothing until armed, then runs its action once. */
function armable(): { seam: () => Promise<void>; arm(action: () => Promise<void>): void } {
  let action: (() => Promise<void>) | undefined;
  return {
    seam: async () => {
      const next = action;
      action = undefined;
      await next?.();
    },
    arm: (next) => {
      action = next;
    }
  };
}

async function open(seams: StoreSeams, protection?: ReturnType<typeof hostProtection>): Promise<OpenedStore> {
  const store = await openStore({ rootDir: root.rootDir, projectId: PROJECT, seams, ...(protection ? { protection } : {}) });
  opened.push(store);
  return store;
}

async function exists(file: string): Promise<boolean> {
  return stat(file).then(() => true, (error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return false;
    throw error;
  });
}

async function objectRow(store: OpenedStore, objectId: string): Promise<{ object_id: string } | undefined> {
  return withDatabase(store.pool, PROJECT, (database) => database.get<{ object_id: string }>("select object_id from objects where object_id = ?", [objectId]));
}

describe("a writer racing a removal", () => {
  it("keeps its file when a sweep releases the object it holds before it records the reference", async () => {
    const writerSeam = armable();
    const store = await open({ beforeWriterCommit: writerSeam.seam });
    const content = Buffer.from("swept while a writer holds it");
    const first = await store.store.putBytes({ content, mediaType: "text/plain", createdAt: 1 });
    let swept: string[] = [];
    writerSeam.arm(async () => {
      swept = (await store.store.sweepUnreferencedObjects()).deleted;
    });

    const written = await store.store.putBytes({ content, mediaType: "text/plain", owner, createdAt: 2 });

    expect(swept).toEqual([first.object.objectId]);
    expect(written.object.objectId).toBe(first.object.objectId);
    expect(await objectRow(store, written.object.objectId)).toBeDefined();
    expect(await referenceCount(store.pool, PROJECT, written.object.objectId)).toBe(1);
    expect(await exists(written.contentPath)).toBe(true);
    await expect(store.store.readBytesByObjectId(written.object.objectId)).resolves.toMatchObject({ content });
  });

  it("keeps its row and file when the object it resolved is released before its reference", async () => {
    const writerSeam = armable();
    const store = await open({ beforeWriterCommit: writerSeam.seam });
    const content = Buffer.from("released between resolve and reference");
    const first = await store.store.putBytes({ content, mediaType: "text/plain", createdAt: 1 });
    let released: boolean | undefined;
    writerSeam.arm(async () => {
      released = await store.store.removeIfUnreferenced(first.object.objectId);
    });

    const written = await store.store.putBytes({ content, mediaType: "text/plain", owner, createdAt: 2 });

    expect(released).toBe(true);
    expect(await objectRow(store, written.object.objectId)).toBeDefined();
    expect(await referenceCount(store.pool, PROJECT, written.object.objectId)).toBe(1);
    expect(await exists(written.contentPath)).toBe(true);
    await expect(store.store.readBytesByObjectId(written.object.objectId)).resolves.toMatchObject({ content });
  });

  it("restores a sealed object it reuses through its keyed address from the stored bytes it read, when that object is released first", async () => {
    const writerSeam = armable();
    const store = await open({ beforeWriterCommit: writerSeam.seam }, hostProtection());
    const content = Buffer.from("{\"sealed\":\"reused by address\"}");
    const first = await store.store.putBytes({ content, mediaType: "application/json", protect: true, createdAt: 1 });
    let released: boolean | undefined;
    writerSeam.arm(async () => {
      released = await store.store.removeIfUnreferenced(first.object.objectId);
    });

    const written = await store.store.putBytes({ content, mediaType: "application/json", protect: true, owner, createdAt: 2 });

    expect(released).toBe(true);
    expect(written.deduped).toBe(true);
    expect(written.object).toMatchObject({ objectId: first.object.objectId, contentAddress: first.object.contentAddress, contentAddressKeyId: first.object.contentAddressKeyId });
    expect(await objectRow(store, first.object.objectId)).toBeDefined();
    expect(await referenceCount(store.pool, PROJECT, first.object.objectId)).toBe(1);
    expect(await exists(written.contentPath)).toBe(true);
    await expect(store.store.readBytesByObjectId(first.object.objectId)).resolves.toMatchObject({ content });
  });

  it("keeps its file when another process's drain found the pending file unheld just before the writer stored the same bytes", async () => {
    const drainSeam = armable();
    const writerSeam = armable();
    // Two pools: two connections to the project database, as two processes hold.
    const drainer = await open({ beforeDrainRemove: drainSeam.seam });
    const writer = await open({ beforeWriterCommit: writerSeam.seam });
    const content = Buffer.from("stored again while its removal drains");
    const first = await drainer.store.putBytes({ content, mediaType: "text/plain", createdAt: 1 });
    // Released and pending, its file still on disk: what a batch commits before it drains.
    await withDatabase(drainer.pool, PROJECT, (database) => database.transaction((sql) => AutomationStudioProjectObjectRepository.releaseObjectIfUnreferenced(sql, first.object.objectId, 10)));
    expect(await exists(first.contentPath)).toBe(true);

    let write: ReturnType<typeof writer.store.putBytes> | undefined;
    drainSeam.arm(async () => {
      // The writer runs until its file is in place and it is about to commit its row and reference.
      let ready!: () => void;
      const atCommit = new Promise<void>((resolve) => { ready = resolve; });
      writerSeam.arm(async () => ready());
      write = writer.store.putBytes({ content, mediaType: "text/plain", owner, createdAt: 20 });
      await Promise.race([atCommit, write]);
    });

    const drain = await drainer.store.drainPendingRemovals();
    const written = await write!;

    // The drain removed the file before the writer's commit could land; the writer then rewrote it.
    expect(drain).toEqual({ removed: [first.object.objectId], reheld: [], failed: [] });
    expect(written.object.objectId).toBe(first.object.objectId);
    expect(await objectRow(writer, written.object.objectId)).toBeDefined();
    expect(await referenceCount(writer.pool, PROJECT, written.object.objectId)).toBe(1);
    expect(await exists(written.contentPath)).toBe(true);
    await expect(writer.store.readBytesByObjectId(written.object.objectId)).resolves.toMatchObject({ content });
    await expect(drainer.store.readBytesByObjectId(written.object.objectId)).resolves.toMatchObject({ content });
    expect(await withDatabase(drainer.pool, PROJECT, (database) => database.all("select relative_path from object_pending_removals"))).toEqual([]);
  });
});
