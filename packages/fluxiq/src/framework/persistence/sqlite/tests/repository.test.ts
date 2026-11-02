// @fluxiq-test-group real-sql
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sqlite3 from "sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRecord, SQLiteRepository } from "../index.ts";

const roots: string[] = [];

async function repository(): Promise<SQLiteRepository> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-sql-errors-"));
  roots.push(rootDir);
  return new SQLiteRepository({ rootDir, kind: "fixture.records" });
}

function failClose(failure: Error): void {
  const original = sqlite3.Database.prototype.close;
  vi.spyOn(sqlite3.Database.prototype, "close").mockImplementation(function(this: sqlite3.Database, callback?: (error: Error | null) => void): void {
    if (!callback) return Reflect.apply(original, this, []);
    return Reflect.apply(original, this, [function(this: unknown, error: Error | null) {
      Reflect.apply(callback, this, [error ?? failure]);
    }]);
  });
}

function failRollback(failure: Error): () => number {
  const original = sqlite3.Database.prototype.run;
  let calls = 0;
  vi.spyOn(sqlite3.Database.prototype, "run").mockImplementation(function(this: sqlite3.Database, sql: string, ...args: unknown[]): sqlite3.Database {
    if (sql === "rollback") {
      calls += 1;
      const callback = args.at(-1);
      if (typeof callback !== "function") throw new Error("A rollback fault needs the original native callback.");
      queueMicrotask(() => { Reflect.apply(callback, this, [failure]); });
      return this;
    }
    return Reflect.apply(original, this, [sql, ...args]) as sqlite3.Database;
  });
  return () => calls;
}

function failReadAfterNativeResult(failure: Error): () => number {
  const original = sqlite3.Database.prototype.get;
  let calls = 0;
  vi.spyOn(sqlite3.Database.prototype, "get").mockImplementation(function(this: sqlite3.Database, sql: string, ...args: unknown[]): sqlite3.Database {
    if (!sql.startsWith("select id,kind,case ")) return Reflect.apply(original, this, [sql, ...args]) as sqlite3.Database;
    calls += 1;
    const callback = args.at(-1);
    if (typeof callback !== "function") throw new Error("A read fault needs the original native callback.");
    return Reflect.apply(original, this, [sql, ...args.slice(0, -1), function(this: unknown, error: Error | null, row: unknown) {
      Reflect.apply(callback, this, [error ?? failure, row]);
    }]) as sqlite3.Database;
  });
  return () => calls;
}

async function readOnlyRepository(): Promise<SQLiteRepository> {
  const store = await repository();
  await store.put(createRecord({ id: "one", kind: store.kind, data: { actual: true } }));
  const db = await new Promise<sqlite3.Database>((resolve, reject) => {
    const connection = new sqlite3.Database(path.join(store.rootDir, "global.sqlite"), error => error ? reject(error) : resolve(connection));
  });
  try {
    await new Promise<void>((resolve, reject) => {
      db.run("pragma journal_mode = DELETE", error => error ? reject(error) : resolve());
    });
  } finally {
    await new Promise<void>((resolve, reject) => { db.close(error => error ? reject(error) : resolve()); });
  }
  return store;
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe("framework SQLite failure ownership", () => {
  it("omits an absent domain directory and propagates a real non-directory failure", async () => {
    const store = await repository();
    expect(store.databases()).toEqual(["global"]);
    await writeFile(path.join(store.rootDir, "domains"), "blocked");
    let failure: unknown;
    try {
      store.databases();
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ code: "ENOTDIR" });
  });

  it("returns the identical primary error after successful real rollback", async () => {
    const store = await repository();
    const primary = new Error("transaction callback failed");
    await expect(store.transaction({}, async transaction => {
      await transaction.run(`insert into ${store.tableName} (id,kind,data,created_at_ms,updated_at_ms) values (?,?,?,?,?)`, ["one", store.kind, "{}", 1, 1]);
      throw primary;
    })).rejects.toBe(primary);
    expect(await store.get("one")).toBeNull();
  });

  it("exposes primary and native rollback errors after actual SQL work", async () => {
    const store = await repository();
    const primary = new Error("transaction callback failed");
    const cleanup = new Error("native rollback failed");
    const originalRun = sqlite3.Database.prototype.run;
    let rollbackCalls = 0;
    vi.spyOn(sqlite3.Database.prototype, "run").mockImplementation(function(this: sqlite3.Database, sql: string, ...args: unknown[]): sqlite3.Database {
      if (sql === "rollback") {
        rollbackCalls += 1;
        const callback = args.at(-1);
        if (typeof callback !== "function") throw new Error("A rollback fault needs the original native callback.");
        queueMicrotask(() => { Reflect.apply(callback, this, [cleanup]); });
        return this;
      }
      return Reflect.apply(originalRun, this, [sql, ...args]) as sqlite3.Database;
    });
    const outcome = await store.transaction({}, async transaction => {
      await transaction.run(`insert into ${store.tableName} (id,kind,data,created_at_ms,updated_at_ms) values (?,?,?,?,?)`, ["one", store.kind, "{}", 1, 1]);
      expect(await transaction.get("select count(*) as count from " + store.tableName)).toEqual({ count: 1 });
      throw primary;
    }).then(() => undefined, error => error);
    expect(rollbackCalls).toBe(1);
    expect(outcome).toBeInstanceOf(AggregateError);
    expect(outcome.errors[0]).toBe(primary);
    expect(outcome.errors[1]).toBe(cleanup);
    expect(outcome.cause).toBe(primary);
    expect(await store.get("one")).toBeNull();
  });

  it("exposes the original operation and close errors after successful rollback", async () => {
    const store = await repository();
    const primary = new Error("transaction callback failed");
    const closeError = new Error("native close acknowledgement failed");
    failClose(closeError);
    const outcome = await store.transaction({}, async transaction => {
      await transaction.run(`insert into ${store.tableName} (id,kind,data,created_at_ms,updated_at_ms) values (?,?,?,?,?)`, ["one", store.kind, "{}", 1, 1]);
      throw primary;
    }).then(() => undefined, error => error);
    expect(outcome).toBeInstanceOf(AggregateError);
    expect(outcome.errors[0]).toBe(primary);
    expect(outcome.errors[1]).toBe(closeError);
    expect(outcome.cause).toBe(primary);
    vi.restoreAllMocks();
    expect(await store.get("one")).toBeNull();
  });

  it("keeps a rollback AggregateError as the primary when final close also fails", async () => {
    const store = await repository();
    const primary = new Error("transaction callback failed");
    const rollbackError = new Error("native rollback failed");
    const closeError = new Error("native close acknowledgement failed");
    const rollbackCalls = failRollback(rollbackError);
    failClose(closeError);
    const outcome = await store.transaction({}, async transaction => {
      await transaction.run(`insert into ${store.tableName} (id,kind,data,created_at_ms,updated_at_ms) values (?,?,?,?,?)`, ["one", store.kind, "{}", 1, 1]);
      throw primary;
    }).then(() => undefined, error => error);
    expect(rollbackCalls()).toBe(1);
    expect(outcome).toBeInstanceOf(AggregateError);
    const retained = outcome.errors[0];
    expect(retained).toBeInstanceOf(AggregateError);
    expect(retained.errors[0]).toBe(primary);
    expect(retained.errors[1]).toBe(rollbackError);
    expect(retained.cause).toBe(primary);
    expect(outcome.errors[1]).toBe(closeError);
    expect(outcome.cause).toBe(retained);
  });

  it("returns the identical close error alone when actual committed work succeeded", async () => {
    const store = await repository();
    const closeError = new Error("native close acknowledgement failed");
    failClose(closeError);
    await expect(store.transaction({}, async transaction => {
      await transaction.run(`insert into ${store.tableName} (id,kind,data,created_at_ms,updated_at_ms) values (?,?,?,?,?)`, ["one", store.kind, "{}", 1, 1]);
      return "done";
    })).rejects.toBe(closeError);
    vi.restoreAllMocks();
    expect((await store.get("one"))?.id).toBe("one");
  });

  it.each([
    { rollbackFails: false, closeFails: false },
    { rollbackFails: true, closeFails: false },
    { rollbackFails: false, closeFails: true },
    { rollbackFails: true, closeFails: true }
  ])("retains actual read-only failures with rollback=$rollbackFails and close=$closeFails", async ({ rollbackFails, closeFails }) => {
    const store = await readOnlyRepository();
    const primary = new Error("native read acknowledgement failed");
    const rollbackError = new Error("native rollback failed");
    const closeError = new Error("native close acknowledgement failed");
    const readCalls = failReadAfterNativeResult(primary);
    const rollbackCalls = rollbackFails ? failRollback(rollbackError) : undefined;
    if (closeFails) failClose(closeError);
    const outcome = await store.getExistingReadOnlyMany(["one"]).then(() => undefined, error => error);
    expect(readCalls()).toBe(1);
    if (rollbackCalls) expect(rollbackCalls()).toBe(1);
    let retained = outcome;
    if (closeFails) {
      expect(outcome).toBeInstanceOf(AggregateError);
      retained = outcome.errors[0];
      expect(outcome.errors[1]).toBe(closeError);
      expect(outcome.cause).toBe(retained);
    }
    if (rollbackFails) {
      expect(retained).toBeInstanceOf(AggregateError);
      expect(retained.errors[0]).toBe(primary);
      expect(retained.errors[1]).toBe(rollbackError);
      expect(retained.cause).toBe(primary);
    } else {
      expect(retained).toBe(primary);
    }
  });
});
