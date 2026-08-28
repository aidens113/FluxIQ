import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "./project-database.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-project-database-test");

describe("AutomationStudioProjectDatabasePool", () => {
  beforeEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(rootDir, { recursive: true });
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

  it("rejects project IDs that could escape the project database root", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    await expect(pool.acquire("../outside")).rejects.toThrow(/project ID/);
    await pool.closeAll();
  });
});
