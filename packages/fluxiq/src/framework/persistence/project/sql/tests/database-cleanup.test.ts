// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sqlite3 from "sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationStudioProjectDatabase, AutomationStudioStatementCache } from "../index.ts";

let rootDir = "";
const databases: AutomationStudioProjectDatabase[] = [];

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-project-cleanup-"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(databases.splice(0).map(database => database.close()));
  await rm(rootDir, { recursive: true, force: true });
});

async function openDatabase(): Promise<AutomationStudioProjectDatabase> {
  const database = await AutomationStudioProjectDatabase.open({
    projectId: "project.cleanup",
    filePath: path.join(rootDir, "project.sqlite"),
    busyTimeoutMs: 1_000
  });
  databases.push(database);
  return database;
}

function failSetup(primary: Error): void {
  const original = AutomationStudioStatementCache.prototype.exec;
  vi.spyOn(AutomationStudioStatementCache.prototype, "exec").mockImplementation(async function(this: AutomationStudioStatementCache, script) {
    await Reflect.apply(original, this, [script]);
    throw primary;
  });
}

function failClose(cleanup: Error): () => number {
  const original = sqlite3.Database.prototype.close;
  let calls = 0;
  vi.spyOn(sqlite3.Database.prototype, "close").mockImplementation(function(this: sqlite3.Database, callback?: (error: Error | null) => void): void {
    calls += 1;
    if (!callback) return Reflect.apply(original, this, []);
    return Reflect.apply(original, this, [function(this: unknown, error: Error | null) {
      Reflect.apply(callback, this, [error ?? cleanup]);
    }]);
  });
  return () => calls;
}

describe("project SQL cleanup failure ownership", () => {
  it("throws the identical setup error when closing succeeds", async () => {
    const primary = new Error("setup failed");
    failSetup(primary);
    await expect(openDatabase()).rejects.toBe(primary);
  });

  it("retains setup and native close errors when both fail", async () => {
    const primary = new Error("setup failed");
    const cleanup = new Error("native close acknowledgement failed");
    failSetup(primary);
    const closeCalls = failClose(cleanup);
    const outcome = await openDatabase().then(() => undefined, error => error);
    expect(closeCalls()).toBe(1);
    expect(outcome).toBeInstanceOf(AggregateError);
    expect(outcome.errors[0]).toBe(primary);
    expect(outcome.errors[1]).toBe(cleanup);
    expect(outcome.cause).toBe(primary);
  });

  it("throws the identical operation error after a successful real rollback", async () => {
    const database = await openDatabase();
    const primary = new Error("operation failed");
    await database.run("create table items (id text primary key)");
    await expect(database.transaction(async sql => {
      await sql.run("insert into items (id) values ('rolled-back')");
      throw primary;
    })).rejects.toBe(primary);
    await expect(database.all("select id from items")).resolves.toEqual([]);
  });

  it.each(["operation", "commit"])("retains the original %s and rollback errors", async failureAt => {
    const database = await openDatabase();
    const primary = new Error(`${failureAt} failed`);
    const cleanup = new Error("rollback acknowledgement failed");
    const original = AutomationStudioStatementCache.prototype.run;
    let rollbackCalls = 0;
    vi.spyOn(AutomationStudioStatementCache.prototype, "run").mockImplementation(async function(this: AutomationStudioStatementCache, sql, params) {
      if (sql === "commit" && failureAt === "commit") throw primary;
      const result = await Reflect.apply(original, this, [sql, params]);
      if (sql === "rollback") {
        rollbackCalls += 1;
        throw cleanup;
      }
      return result;
    });
    await database.run("create table items (id text primary key)");
    const outcome = await database.transaction(async sql => {
      await sql.run("insert into items (id) values ('rolled-back')");
      if (failureAt === "operation") throw primary;
      return "done";
    }).then(() => undefined, error => error);
    expect(rollbackCalls).toBe(1);
    expect(outcome).toBeInstanceOf(AggregateError);
    expect(outcome.errors[0]).toBe(primary);
    expect(outcome.errors[1]).toBe(cleanup);
    expect(outcome.cause).toBe(primary);
    await expect(database.all("select id from items")).resolves.toEqual([]);
  });

  it("throws the identical native close error when no primary operation failed", async () => {
    const database = await openDatabase();
    const cleanup = new Error("native close acknowledgement failed");
    failClose(cleanup);
    await expect(database.close()).rejects.toBe(cleanup);
    databases.splice(databases.indexOf(database), 1);
  });
});
