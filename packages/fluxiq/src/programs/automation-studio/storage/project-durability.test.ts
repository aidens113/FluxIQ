import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabase, AutomationStudioProjectDatabasePool } from "./project-database.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-durability-test");

describe("Automation Studio project database durability", () => {
  beforeEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(rootDir, { recursive: true });
  });
  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

  it("rejects corrupted project databases during open and releases the handle", async () => {
    const projectDir = path.join(rootDir, "projects", "project.corrupt");
    await mkdir(projectDir, { recursive: true });
    await writeFile(path.join(projectDir, "project.sqlite"), "this is not sqlite");
    const pool = new AutomationStudioProjectDatabasePool({ rootDir, busyTimeoutMs: 100 });
    await expect(pool.acquire("project.corrupt")).rejects.toThrow();
    await pool.closeAll();
    await expect(rm(rootDir, { recursive: true, force: true })).resolves.toBeUndefined();
  });

  it("honors busy timeout when another writer holds the database", async () => {
    const projectDir = path.join(rootDir, "projects", "project.busy");
    await mkdir(projectDir, { recursive: true });
    const filePath = path.join(projectDir, "project.sqlite");
    const first = await AutomationStudioProjectDatabase.open({ projectId: "project.busy.first", filePath, busyTimeoutMs: 100 });
    const second = await AutomationStudioProjectDatabase.open({ projectId: "project.busy.second", filePath, busyTimeoutMs: 100 });
    try {
      await first.run("create table busy_items (id text primary key)");
      await first.run("begin immediate");
      const startedAt = performance.now();
      await expect(second.run("insert into busy_items (id) values ('blocked')")).rejects.toThrow(/SQLITE_BUSY|locked|busy/i);
      expect(performance.now() - startedAt).toBeGreaterThanOrEqual(50);
    } finally {
      await first.run("rollback").catch(() => undefined);
      await second.close();
      await first.close();
    }
  });

  it("runs integrity checks and explicit WAL checkpoints", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const lease = await pool.acquire("project.checkpoint");
    try {
      await lease.database.run("create table checkpoint_items (id text primary key, value text not null)");
      for (let index = 0; index < 20; index += 1) await lease.database.run("insert into checkpoint_items (id, value) values (?, ?)", [`item.${index}`, `Value ${index}`]);
      await expect(lease.database.integrityCheck()).resolves.toEqual(["ok"]);
      const checkpoint = await lease.database.checkpoint("truncate");
      expect(checkpoint.busy).toBeGreaterThanOrEqual(0);
      expect(checkpoint.log).toBeGreaterThanOrEqual(0);
      expect(checkpoint.checkpointed).toBeGreaterThanOrEqual(0);
    } finally {
      await lease.release();
      await pool.closeAll();
    }
  });

  it("drains queued work before shutdown completes", async () => {
    const projectDir = path.join(rootDir, "projects", "project.shutdown");
    await mkdir(projectDir, { recursive: true });
    const filePath = path.join(projectDir, "project.sqlite");
    const database = await AutomationStudioProjectDatabase.open({ projectId: "project.shutdown", filePath, busyTimeoutMs: 1_000 });
    await database.run("create table shutdown_items (id text primary key)");
    const pending = database.transaction(async (sql) => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      await sql.run("insert into shutdown_items (id) values ('done')");
    });
    const closing = database.close();
    await expect(pending).resolves.toBeUndefined();
    await expect(closing).resolves.toBeUndefined();
    const reopened = await AutomationStudioProjectDatabase.open({ projectId: "project.shutdown", filePath, busyTimeoutMs: 1_000 });
    try {
      await expect(reopened.get<{ count: number }>("select count(*) as count from shutdown_items")).resolves.toEqual({ count: 1 });
    } finally {
      await reopened.close();
    }
  });
});

