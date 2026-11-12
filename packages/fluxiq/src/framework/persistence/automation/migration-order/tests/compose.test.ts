// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "../../project/index.ts";
import { AutomationStudioSchemaMigrationRunner } from "../../schema-migrations.ts";
import { automationStudioSchemaMigrationOrder } from "../index.ts";

let rootDir: string | undefined;
let pool: AutomationStudioProjectDatabasePool | undefined;
afterEach(async () => {
  await pool?.closeAll();
  if (rootDir) await rm(rootDir, { recursive: true, force: true });
  rootDir = undefined;
  pool = undefined;
});

async function database() {
  rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-migration-order-"));
  pool = new AutomationStudioProjectDatabasePool({ rootDir });
  return pool.acquire("project.order");
}

describe("independently owned migration sets", () => {
  it("compose in exact codepoint ID order without mutating either set", () => {
    const administration = Object.freeze([{ id: "0037_new", statements: [] }, { id: "0001_base", statements: [] }]);
    const owner = Object.freeze([{ id: "0033_private", statements: [] }, { id: "0037.new", statements: [] }]);
    expect(automationStudioSchemaMigrationOrder(administration, owner).map((migration) => migration.id)).toEqual(["0001_base", "0033_private", "0037.new", "0037_new"]);
    expect(administration.map((migration) => migration.id)).toEqual(["0037_new", "0001_base"]);
    expect(owner.map((migration) => migration.id)).toEqual(["0033_private", "0037.new"]);
  });

  it("retain duplicate IDs for the strict runner to reject before any migration runs", async () => {
    const lease = await database();
    try {
      const migrations = automationStudioSchemaMigrationOrder([{ id: "0001_same", statements: ["create table one (id text)"] }], [{ id: "0001_same", statements: ["create table two (id text)"] }]);
      expect(migrations).toHaveLength(2);
      expect(() => new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations })).toThrow("unique, ascending IDs");
      expect(await lease.database.all("select name from sqlite_master where type = 'table' and name in ('one', 'two')")).toEqual([]);
    } finally {
      await lease.release();
    }
  });

  it("apply an older owner migration when a newer administration migration is already installed", async () => {
    const lease = await database();
    const administration = [{ id: "0001_base", statements: ["create table base (id text)"] }, { id: "0037_new", statements: ["create table newer (id text)"] }];
    const owner = [{ id: "0033_private", statements: ["create table older (id text)"] }];
    try {
      await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: administration }).migrate();
      const runner = new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: automationStudioSchemaMigrationOrder(administration, owner) });
      expect(await runner.migrate()).toMatchObject({ applied: ["0033_private"], status: "ready" });
      expect(await runner.migrate()).toMatchObject({ applied: [], status: "ready" });
      expect(await lease.database.all("select name from sqlite_master where type = 'table' and name in ('base', 'newer', 'older') order by name")).toEqual([{ name: "base" }, { name: "newer" }, { name: "older" }]);
    } finally {
      await lease.release();
    }
  });
});
