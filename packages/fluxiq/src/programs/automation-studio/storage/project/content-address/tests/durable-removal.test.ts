// @fluxiq-test-group real-sql
// Durable removal of old plaintext forms (t745 u5). A scrub request commits
// with the change that needs it, survives a process that stops before the
// scrub, a busy or failed VACUUM, and is cleared only by a scrub that VACUUMed
// and truncated the WAL, after which no free page is left. An object released
// (row deleted, pending removal recorded) by a process that stops before its
// file goes is finished by the next content store open; one stored again since
// keeps its file; a file that cannot be removed keeps its row and is reported.
// Pending removals are keyed by file path (t747, 0036): the rows 0033 held are
// carried over, an object row that lives on at a new path does not hold its
// old path, and one object may have two paths pending at once.
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "../../database.ts";
import type { AutomationStudioProjectDatabase } from "../../database.ts";
import { AutomationStudioProjectObjectRepository } from "../../object-repository.ts";
import { requestContentAddressScrub, scrubProjectDatabaseIfRequested } from "../index.ts";
import type { ContentAddressScrubDatabase } from "../index.ts";
import { makeTempRoot, openTestProject } from "./keyring-fixture.ts";
import { openStore, withDatabase } from "./object-address-fixture.ts";

let root: Awaited<ReturnType<typeof makeTempRoot>>;

beforeEach(async () => {
  root = await makeTempRoot();
});
afterEach(async () => root.remove());

const PROJECT = "project.removal";

async function exists(file: string): Promise<boolean> {
  return stat(file).then(() => true, (error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return false;
    throw error;
  });
}

async function scalar(database: AutomationStudioProjectDatabase, statement: string): Promise<number> {
  const row = await database.get<Record<string, number>>(statement);
  return Number(Object.values(row ?? {})[0] ?? 0);
}

async function pendingRows(pool: AutomationStudioProjectDatabasePool): Promise<Array<{ objectId: string }>> {
  return withDatabase(pool, PROJECT, (database) => database.all<{ objectId: string }>("select object_id as objectId from object_pending_removals order by object_id"));
}

/** A database whose VACUUM throws `error`; every other statement runs. */
function vacuumThrowing(database: AutomationStudioProjectDatabase, error: Error): ContentAddressScrubDatabase {
  return {
    get: (statement, params) => database.get(statement, params),
    run: async (statement, params) => {
      if (statement === "vacuum") throw error;
      return database.run(statement, params);
    },
    checkpoint: (mode) => database.checkpoint(mode)
  };
}

describe("scrub requests", () => {
  it("survive a skipped scrub and a busy or failed VACUUM, and the next scrub clears them and leaves no free page", async () => {
    const first = await openStore({ rootDir: root.rootDir, projectId: PROJECT });
    await withDatabase(first.pool, PROJECT, async (database) => {
      expect(await scrubProjectDatabaseIfRequested(database)).toEqual({ status: "not-requested" });
      // Free pages to show the VACUUM ran: a table filled and dropped.
      await database.run("create table scratch_pages (body blob not null)");
      for (let index = 0; index < 64; index += 1) await database.run("insert into scratch_pages (body) values (randomblob(4000))");
      await database.run("drop table scratch_pages");
      await database.transaction(async (sql) => {
        await requestContentAddressScrub(sql, 1_000);
        await requestContentAddressScrub(sql, 1_000);
      });
      // A second request in the same millisecond still moves the time on, so a running scrub never clears it.
      expect(await scalar(database, "select requested_at_ms from content_address_scrub_requests where singleton = 1")).toBe(1_001);
    });
    // The process stops here, before any scrub.
    await first.close();

    const second = await openStore({ rootDir: root.rootDir, projectId: PROJECT });
    try {
      await withDatabase(second.pool, PROJECT, async (database) => {
        expect(await scalar(database, "select count(*) from content_address_scrub_requests")).toBe(1);
        expect(await scalar(database, "pragma freelist_count")).toBeGreaterThan(0);

        const busy = Object.assign(new Error("SQLITE_BUSY: database is locked"), { code: "SQLITE_BUSY" });
        expect(await scrubProjectDatabaseIfRequested(vacuumThrowing(database, busy))).toEqual({ status: "busy", stage: "vacuum" });
        const broken = Object.assign(new Error("disk path C:/secret/project.sqlite"), { code: "EIO" });
        expect(await scrubProjectDatabaseIfRequested(vacuumThrowing(database, broken))).toEqual({ status: "failed", stage: "vacuum", reason: "Error" });
        expect(await scalar(database, "select count(*) from content_address_scrub_requests")).toBe(1);

        const done = await scrubProjectDatabaseIfRequested(database);
        expect(done).toMatchObject({ status: "done", checkpoint: { busy: 0 } });
        expect(await scalar(database, "select count(*) from content_address_scrub_requests")).toBe(0);
        expect(await scalar(database, "pragma freelist_count")).toBe(0);
        expect(await scrubProjectDatabaseIfRequested(database)).toEqual({ status: "not-requested" });
      });
    } finally {
      await second.close();
    }
  });
});

describe("pending object removals", () => {
  it("finish at the next content store open when the process stopped after the release", async () => {
    const first = await openStore({ rootDir: root.rootDir, projectId: PROJECT });
    const loose = await first.store.putBytes({ content: Buffer.from("released, file left behind"), mediaType: "text/plain", createdAt: 1 });
    const kept = await first.store.putBytes({ content: Buffer.from("still referenced"), mediaType: "text/plain", owner: { ownerKind: "test_owner", ownerId: "a", purpose: "payload" }, createdAt: 2 });
    // What a batch commits before the process stops: the row released and its removal pending, the file not yet removed.
    await withDatabase(first.pool, PROJECT, (database) => database.transaction(async (sql) => {
      expect(await AutomationStudioProjectObjectRepository.releaseObjectIfUnreferenced(sql, loose.object.objectId, 10)).toMatchObject({ objectId: loose.object.objectId });
      expect(await AutomationStudioProjectObjectRepository.releaseObjectIfUnreferenced(sql, kept.object.objectId, 10)).toBeNull();
    }));
    expect(await pendingRows(first.pool)).toEqual([{ objectId: loose.object.objectId }]);
    expect(await exists(loose.contentPath)).toBe(true);
    await first.close();

    const second = await openStore({ rootDir: root.rootDir, projectId: PROJECT });
    try {
      expect(second.store.drainedAtOpen).toEqual({ removed: [loose.object.objectId], reheld: [], failed: [] });
      expect(await exists(loose.contentPath)).toBe(false);
      expect(await pendingRows(second.pool)).toEqual([]);
      expect(await exists(kept.contentPath)).toBe(true);
      await expect(second.store.readBytesByObjectId(kept.object.objectId)).resolves.toMatchObject({ content: Buffer.from("still referenced") });
    } finally {
      await second.close();
    }
  });

  it("keep the file of an object stored again since its release, and keep the row of a file that cannot be removed", async () => {
    const first = await openStore({ rootDir: root.rootDir, projectId: PROJECT });
    const content = Buffer.from("released, then stored again");
    const stored = await first.store.putBytes({ content, mediaType: "text/plain", createdAt: 1 });
    await withDatabase(first.pool, PROJECT, (database) => database.transaction((sql) => AutomationStudioProjectObjectRepository.releaseObjectIfUnreferenced(sql, stored.object.objectId, 10)));
    const again = await first.store.putBytes({ content, mediaType: "text/plain", createdAt: 2 });
    expect(again.object.objectId).toBe(stored.object.objectId);
    // A pending removal whose path is a directory with a file in it: removing it without recursion fails.
    const blocked = path.join("projects", PROJECT, "objects", "blocked");
    await mkdir(path.join(root.rootDir, blocked), { recursive: true });
    await writeFile(path.join(root.rootDir, blocked, "inside.txt"), "x");
    await withDatabase(first.pool, PROJECT, (database) => database.run("insert into object_pending_removals (object_id, relative_path, released_at_ms) values (?, ?, ?)", ["object:blocked", blocked.replaceAll(path.sep, "/"), 10]));
    await first.close();

    const second = await openStore({ rootDir: root.rootDir, projectId: PROJECT });
    try {
      const drain = second.store.drainedAtOpen;
      expect(drain.removed).toEqual([]);
      expect(drain.reheld).toEqual([stored.object.objectId]);
      expect(drain.failed).toHaveLength(1);
      expect(drain.failed[0]!.objectId).toBe("object:blocked");
      expect(drain.failed[0]!.reason).not.toContain(PROJECT);
      expect(await exists(again.contentPath)).toBe(true);
      await expect(second.store.readBytesByObjectId(stored.object.objectId)).resolves.toMatchObject({ content });
      expect(await pendingRows(second.pool)).toEqual([{ objectId: "object:blocked" }]);
      expect(await second.store.drainPendingRemovals()).toMatchObject({ removed: [], failed: [{ objectId: "object:blocked" }] });
    } finally {
      await second.close();
    }
  });
});

describe("pending removals keyed by file path", () => {
  it("are carried over from 0033 by the 0036 migration, which keys them by path", async () => {
    const legacy = await openTestProject(root.rootDir, PROJECT);
    const blocked = path.join("projects", PROJECT, "objects", "blocked");
    const loose = path.join("projects", PROJECT, "objects", "loose.bin");
    await mkdir(path.join(root.rootDir, blocked), { recursive: true });
    await writeFile(path.join(root.rootDir, blocked, "inside.txt"), "x");
    await writeFile(path.join(root.rootDir, loose), "loose");
    await legacy.database.run("insert into object_pending_removals (object_id, relative_path, released_at_ms) values (?, ?, ?), (?, ?, ?)", ["object:carried", blocked.replaceAll(path.sep, "/"), 10, "object:gone", loose.replaceAll(path.sep, "/"), 11]);
    await legacy.close();

    const opened = await openStore({ rootDir: root.rootDir, projectId: PROJECT });
    try {
      expect(opened.store.drainedAtOpen).toMatchObject({ removed: ["object:gone"], reheld: [], failed: [{ objectId: "object:carried" }] });
      expect(await exists(path.join(root.rootDir, loose))).toBe(false);
      await withDatabase(opened.pool, PROJECT, async (database) => {
        expect(await database.all("select relative_path as relativePath, object_id as objectId, released_at_ms as releasedAt from object_pending_removals"))
          .toEqual([{ relativePath: blocked.replaceAll(path.sep, "/"), objectId: "object:carried", releasedAt: 10 }]);
        expect(await database.get("select migration_id as id from automation_schema_migrations where migration_id like '0036_%'")).toEqual({ id: "0036_object_pending_removal_paths" });
        // Keyed by path: the same object may be pending at a second path, but a path is pending once.
        await database.run("insert into object_pending_removals (relative_path, object_id, released_at_ms) values (?, ?, ?)", ["projects/other.bin", "object:carried", 12]);
        await expect(database.run("insert into object_pending_removals (relative_path, object_id, released_at_ms) values (?, ?, ?)", ["projects/other.bin", "object:else", 13])).rejects.toThrow("SQLITE_CONSTRAINT");
      });
    } finally {
      await opened.close();
    }
  });

  it("remove an old path an object row no longer names, though the object lives on at a new path", async () => {
    const opened = await openStore({ rootDir: root.rootDir, projectId: PROJECT });
    try {
      const content = Buffer.from("lives on at a new path");
      const live = await opened.store.putBytes({ content, mediaType: "text/plain", owner: { ownerKind: "test_owner", ownerId: "a", purpose: "payload" }, createdAt: 1 });
      // What a re-seal leaves: the row moved to a new file, its old file released under the same object id.
      const oldPath = path.join("projects", PROJECT, "objects", "resealed-old.bin");
      await writeFile(path.join(root.rootDir, oldPath), "old sealed form");
      await withDatabase(opened.pool, PROJECT, (database) => database.run("insert into object_pending_removals (object_id, relative_path, released_at_ms) values (?, ?, ?)", [live.object.objectId, oldPath.replaceAll(path.sep, "/"), 10]));

      expect(await opened.store.drainPendingRemovals()).toEqual({ removed: [live.object.objectId], reheld: [], failed: [] });
      expect(await exists(path.join(root.rootDir, oldPath))).toBe(false);
      expect(await exists(live.contentPath)).toBe(true);
      await expect(opened.store.readBytesByObjectId(live.object.objectId)).resolves.toMatchObject({ content });
      expect(await pendingRows(opened.pool)).toEqual([]);
    } finally {
      await opened.close();
    }
  });
});
