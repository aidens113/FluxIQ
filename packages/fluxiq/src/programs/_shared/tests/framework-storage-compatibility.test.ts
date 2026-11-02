// @fluxiq-test-group real-sql
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { JsonObject } from "../../../core/index.ts";
import * as legacyStorage from "../storage.ts";
import { programStateRoot as legacyRoot } from "../state-root.ts";
import { programStateConnections as legacyConnections } from "../state-connections.ts";
import * as legacyRepository from "../../database-manager/storage/sqlite-repository.ts";
import { SQLiteConnectionPool as LegacyPool } from "../../database-manager/storage/connection-pool.ts";
import { enqueueDatabaseOperation as legacyEnqueue } from "../../database-manager/storage/operation-queue.ts";
import type { RecordEnvelope as LegacyEnvelope, Repository as LegacyRepository, RepositoryListPage as LegacyPage, RepositoryListPageOptions as LegacyPageOptions, RepositoryScope as LegacyScope } from "../../database-manager/index.ts";
import * as storage from "../../../framework/persistence/index.ts";

const roots: string[] = [];

async function temporaryRoot(sql = false): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-framework-storage-"));
  roots.push(root);
  if (sql) await writeFile(path.join(root, "config.json"), JSON.stringify({ layoutVersion: 2 }));
  return root;
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    await storage.programStateConnections.close(root);
    await rm(root, { recursive: true, force: true });
  }
});

describe("framework storage compatibility", () => {
  it("exports the original class, method, helper and rich contract authorities through every legacy seam", () => {
    expect(legacyStorage.ProgramJsonStore).toBe(storage.ProgramJsonStore);
    expect(legacyStorage.ProgramJsonStore.prototype.read).toBe(storage.ProgramJsonStore.prototype.read);
    expect(legacyStorage.ProgramJsonStore.prototype.update).toBe(storage.ProgramJsonStore.prototype.update);
    expect(legacyStorage.ProgramDocumentTransaction).toBe(storage.ProgramDocumentTransaction);
    expect(legacyStorage.ProgramStateReadError).toBe(storage.ProgramStateReadError);
    expect(legacyRepository.SQLiteRepository).toBe(storage.SQLiteRepository);
    expect(legacyRepository.SQLiteRepository.prototype.put).toBe(storage.SQLiteRepository.prototype.put);
    expect(legacyRepository.createRecord).toBe(storage.createRecord);
    expect(LegacyPool).toBe(storage.SQLiteConnectionPool);
    expect(legacyEnqueue).toBe(storage.enqueueDatabaseOperation);
    expect(legacyRoot).toBe(storage.programStateRoot);
    expect(legacyConnections).toBe(storage.programStateConnections);
    expect(legacyStorage.programStateConnections).toBe(storage.programStateConnections);
    for (const name of ["programDataFile", "normalizeScope", "scopeKey", "safeSegment", "isJsonObject", "cloneJson"] as const) {
      expect(legacyStorage[name]).toBe(storage[name]);
    }
    expectTypeOf<LegacyScope>().toEqualTypeOf<storage.RepositoryScope>();
    expectTypeOf<LegacyEnvelope<JsonObject>>().toEqualTypeOf<storage.RecordEnvelope<JsonObject>>();
    expectTypeOf<LegacyPageOptions>().toEqualTypeOf<storage.RepositoryListPageOptions>();
    expectTypeOf<LegacyPage<JsonObject>>().toEqualTypeOf<storage.RepositoryListPage<JsonObject>>();
    expectTypeOf<LegacyRepository<JsonObject>>().toEqualTypeOf<storage.Repository<JsonObject>>();
  });

  it("serializes mixed-import file updates behind the same original lock and keeps the envelope bytes", async () => {
    const root = await temporaryRoot();
    const file = path.join(root, "documents", "counter.json");
    const first = new storage.ProgramJsonStore(file, () => ({ count: 0 }));
    const second = new legacyStorage.ProgramJsonStore(file, () => ({ count: 0 }));
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const one = first.update(async current => {
      entered();
      await held;
      return { count: current.count + 1 };
    });
    await started;
    const read = vi.spyOn(second, "read");
    const two = second.update(current => ({ count: current.count + 1 }));
    try {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(read).not.toHaveBeenCalled();
    } finally {
      release();
      await Promise.all([one, two]);
    }
    expect(await first.read()).toEqual({ count: 2 });
    expect(await readFile(file, "utf8")).toBe(`${JSON.stringify({ version: 1, data: { count: 2 } }, null, 2)}\n`);
  });

  it("uses real shared SQL storage and rolls back mixed-import document transactions with the original error", async () => {
    const root = await temporaryRoot(true);
    const first = path.join(root, "programs", "storage-test", "first.json");
    const second = path.join(root, "programs", "storage-test", "second.json");
    const legacy = new legacyStorage.ProgramJsonStore<JsonObject>(first, () => ({}));
    const pool = legacyConnections.forRoot(root);
    const failure = new Error("owned transaction failed");
    await pool.keepWhile(async () => {
      await legacy.write({ value: "before" });
      await expect(storage.ProgramJsonStore.transaction(first, async transaction => {
        expect(transaction).toBeInstanceOf(legacyStorage.ProgramDocumentTransaction);
        await transaction.write(first, { value: "after" });
        await transaction.write(second, { created: true });
        throw failure;
      })).rejects.toBe(failure);
      expect(await new storage.ProgramJsonStore<JsonObject>(first, () => ({})).read()).toEqual({ value: "before" });
      expect(await new legacyStorage.ProgramJsonStore<JsonObject>(second, () => ({})).read()).toEqual({});
      const repository = new storage.SQLiteRepository({ rootDir: root, kind: "program.state", layoutVersion: 2, connections: pool });
      expect((await repository.get("storage-test/first"))?.data).toEqual({ value: "before" });
    });
    const automation = path.join(root, "artifacts", "automation-studio", "projects", "one", "manifest.json");
    await new storage.ProgramJsonStore<JsonObject>(automation, () => ({})).write({ project: "one" });
    const automationRepository = new legacyRepository.SQLiteRepository({ rootDir: root, kind: "automation.state", layoutVersion: 2 });
    expect((await automationRepository.get("projects/one/manifest"))?.data).toEqual({ project: "one" });
  });

  it("keeps one mixed-import database queue and runs the next operation after the original rejection", async () => {
    const root = await temporaryRoot();
    const file = path.join(root, "queue.sqlite");
    const order: string[] = [];
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const failure = new Error("first operation failed");
    const first = storage.enqueueDatabaseOperation(file, async () => {
      order.push("first");
      entered();
      await held;
      throw failure;
    });
    const firstOutcome = first.then(() => undefined, error => error);
    await started;
    const second = legacyEnqueue(file, async () => { order.push("second"); });
    try {
      await Promise.resolve();
      await Promise.resolve();
      expect(order).toEqual(["first"]);
    } finally {
      release();
      await second;
    }
    expect(await firstOutcome).toBe(failure);
    expect(order).toEqual(["first", "second"]);
  });

  it("shares the original root resolver and per-root pools without closing another root", async () => {
    const first = await temporaryRoot(true);
    const second = await temporaryRoot(true);
    const nested = path.join(first, "artifacts", "automation-studio", "projects");
    await mkdir(nested, { recursive: true });
    expect(legacyRoot(nested)).toEqual(storage.programStateRoot(nested));
    const firstPool = storage.programStateConnections.forRoot(nested);
    expect(legacyConnections.forRoot(first)).toBe(firstPool);
    expect(firstPool).toBeInstanceOf(LegacyPool);
    const secondPool = legacyConnections.forRoot(second);
    expect(secondPool).not.toBe(firstPool);
    await legacyConnections.close(first);
    expect(storage.programStateConnections.roots()).toContain(second);
    expect(storage.programStateConnections.forRoot(second)).toBe(secondPool);
  });
});
