import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "../database.ts";

// Its own directory per case: a fixed path under the working directory was
// shared by every run of this file in the checkout, so two runs at once
// deleted and overwrote each other's data.
let rootDir = "";

describe("AutomationStudioProjectDatabasePool", () => {
  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-project-database-test-"));
  });

  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

  it("shares one long-lived configured connection for concurrent project leases", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const [first, second] = await Promise.all([pool.acquire("project.shared"), pool.acquire("project.shared")]);
    expect(first.database).toBe(second.database);
    expect(pool.stats().openProjects).toBe(1);
    await first.database.run("create table items (id text primary key, value text not null)");
    await first.database.run("insert into items (id, value) values (?, ?)", ["one", "first"]);
    await expect(second.database.get<{ value: string }>("select value from items where id = ?", ["one"])).resolves.toEqual({ value: "first" });
    await expect(first.database.get<{ foreignKeys: number }>("pragma foreign_keys")).resolves.toEqual({ foreign_keys: 1 });
    await first.release();
    await expect(second.database.get<{ count: number }>("select count(*) as count from items")).resolves.toEqual({ count: 1 });
    await second.release();
    await expect(second.database.get("select 1")).rejects.toThrow(/closed/);
    await pool.closeAll();
  });

  it("serializes operations and keeps transactions contiguous", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const lease = await pool.acquire("project.serial");
    await lease.database.run("create table events (sequence integer primary key, label text not null)");
    const order: string[] = [];
    const transaction = lease.database.transaction(async (sql) => {
      order.push("transaction-start");
      await sql.run("insert into events (sequence, label) values (1, 'first')");
      await new Promise((resolve) => setTimeout(resolve, 15));
      await sql.run("insert into events (sequence, label) values (2, 'second')");
      order.push("transaction-end");
    });
    const following = lease.database.run("insert into events (sequence, label) values (3, 'third')").then(() => order.push("following"));
    await Promise.all([transaction, following]);
    expect(order).toEqual(["transaction-start", "transaction-end", "following"]);
    await expect(lease.database.all<{ sequence: number }>("select sequence from events order by sequence")).resolves.toEqual([{ sequence: 1 }, { sequence: 2 }, { sequence: 3 }]);
    await lease.release();
    await pool.closeAll();
  });

  it("never hands a lease a database closed by the last release while that lease awaited its entry", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const first = await pool.acquire("project.race");
    await first.database.run("create table items (id text primary key)");
    const pending = pool.acquire("project.race");
    const releasing = first.release();
    const second = await pending;
    await releasing;
    await expect(second.database.run("insert into items (id) values (?)", ["after-release"])).resolves.toMatchObject({ changes: 1 });
    await expect(second.database.get<{ count: number }>("select count(*) as count from items")).resolves.toEqual({ count: 1 });
    expect(pool.stats().openProjects).toBe(1);
    await second.release();
    expect(pool.stats().openProjects).toBe(0);
    await pool.closeAll();
  });

  it("rejects project IDs that could escape the project database root", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    await expect(pool.acquire("../outside")).rejects.toThrow(/project ID/);
    await pool.closeAll();
  });
});

// The project connection keeps `run` and `all` statements prepared. These cases
// hold that reuse to exactly what a statement prepared afresh would do.

describe("AutomationStudioStatementCache through a project connection", () => {
  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-statement-cache-test-"));
  });

  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

  it("reuses run and all statements with fresh bindings and still closes the connection", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const lease = await pool.acquire("project.cache");
    const database = lease.database;
    await database.run("create table items (id integer primary key, label text)");
    for (const label of ["a", "b", "c"]) {
      await expect(database.run("insert into items (label) values (?)", [label])).resolves.toMatchObject({ changes: 1 });
    }
    await expect(database.run("update items set label = ? where id = ?", ["B", 2])).resolves.toMatchObject({ changes: 1 });
    await expect(database.run("update items set label = ? where id = ?", ["Z", 99])).resolves.toMatchObject({ changes: 0 });
    await expect(database.all("select label from items where id >= ? order by id", [2])).resolves.toEqual([{ label: "B" }, { label: "c" }]);
    await expect(database.all("select label from items where id >= ? order by id", [3])).resolves.toEqual([{ label: "c" }]);
    // A cached all without values sees writes made since it last ran.
    await expect(database.all("select count(*) as count from items")).resolves.toEqual([{ count: 3 }]);
    await database.run("insert into items (label) values (?)", ["d"]);
    await expect(database.all("select count(*) as count from items")).resolves.toEqual([{ count: 4 }]);
    // Closing finalizes every cached statement; SQLite refuses otherwise.
    await expect(lease.release()).resolves.toBeUndefined();
    await pool.closeAll();
  });

  it("binds NULL for a placeholder called without values, as a fresh statement does", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const lease = await pool.acquire("project.unbound");
    const database = lease.database;
    await database.run("create table items (id integer primary key, label text)");
    await database.run("insert into items (label) values (?)", ["bound"]);
    await database.run("insert into items (label) values (?)");
    await expect(database.all("select label from items order by id")).resolves.toEqual([{ label: "bound" }, { label: null }]);
    await lease.release();
    await pool.closeAll();
  });

  it("drops a statement that failed and runs it again cleanly", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const lease = await pool.acquire("project.failure");
    const database = lease.database;
    await database.run("create table items (id integer primary key, label text not null)");
    await database.run("insert into items (id, label) values (?, ?)", [1, "one"]);
    await expect(database.run("insert into items (id, label) values (?, ?)", [1, "duplicate"])).rejects.toThrow(/SQLITE_CONSTRAINT/);
    await expect(database.run("insert into items (id, label) values (?, ?)", [2, "two"])).resolves.toMatchObject({ changes: 1, lastID: 2 });
    await expect(database.all("select nope from items", [1])).rejects.toThrow(/no such column/);
    await expect(database.all("select label from items order by id")).resolves.toEqual([{ label: "one" }, { label: "two" }]);
    await lease.release();
    await pool.closeAll();
  });

  it("commits and rolls back transactions through cached transaction control", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const lease = await pool.acquire("project.transactions");
    const database = lease.database;
    await database.run("create table items (id integer primary key, label text not null)");
    await database.transaction(async (sql) => { await sql.run("insert into items (label) values (?)", ["kept"]); });
    await expect(database.transaction(async (sql) => {
      await sql.run("insert into items (label) values (?)", ["discarded"]);
      throw new Error("abort");
    })).rejects.toThrow("abort");
    await database.transaction(async (sql) => { await sql.run("insert into items (label) values (?)", ["also kept"]); });
    await expect(database.all("select label from items order by id")).resolves.toEqual([{ label: "kept" }, { label: "also kept" }]);
    await lease.release();
    await pool.closeAll();
  });

  it("keeps issue order between cached and uncached statements issued together", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const lease = await pool.acquire("project.order");
    const database = lease.database;
    await database.run("create table items (id integer primary key, label text not null)");
    await database.all("select count(*) as count from items");
    const [, counted, , recounted] = await database.execute((sql) => Promise.all([
      sql.run("insert into items (label) values (?)", ["first"]),
      sql.all<{ count: number }>("select count(*) as count from items"),
      sql.run("insert into items (label) values (?)", ["second"]),
      sql.get<{ count: number }>("select count(*) as count from items")
    ]));
    expect(counted).toEqual([{ count: 1 }]);
    expect(recounted).toEqual({ count: 2 });
    await lease.release();
    await pool.closeAll();
  });
});
