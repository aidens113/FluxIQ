import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../administration.ts";
import { AutomationStudioProjectDatabasePool, type AutomationStudioSqlExecutor } from "../../database.ts";
import { AUTOMATION_STUDIO_PROJECT_FLOW_SCOPED_KEY_MIGRATION } from "../index.ts";
import { AutomationStudioSchemaMigrationRunner } from "../../../schema-migrations.ts";

// Migration 0024_scoped_flow_keys rekeys `flow_ports`, `flow_variables` and
// `flow_errors` from their id alone to `(flow_id, <id>)` (t405). What must hold
// on a database created with the old keys: every row and column is kept, the
// index and guards on each table come back, and an id may then repeat across
// Flows but not within one.

let rootDir = "";
const MIGRATION = AUTOMATION_STUDIO_PROJECT_FLOW_SCOPED_KEY_MIGRATION;
const PREVIOUS = AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS.filter((migration) => migration.id !== MIGRATION.id);

/** The three tables as `0002_domain_resource_tables` created them, before this migration. */
const OLD_DDL = {
  flow_ports: `create table flow_ports (
      port_id text primary key,
      flow_id text not null,
      direction text not null check (direction in ('input', 'output')),
      name text not null,
      value_type text not null,
      required integer not null default 0 check (required in (0, 1)),
      default_value_json text,
      description text not null default '',
      sort_key text not null default '',
      revision integer not null default 1 check (revision > 0)
    )`,
  flow_variables: `create table flow_variables (
      variable_id text primary key,
      flow_id text not null,
      name text not null,
      value_type text not null,
      initial_value_json text,
      description text not null default '',
      sort_key text not null default '',
      revision integer not null default 1 check (revision > 0)
    )`,
  flow_errors: `create table flow_errors (
      error_id text primary key,
      flow_id text not null,
      code text not null,
      description text not null default '',
      metadata_json text not null default '{}',
      revision integer not null default 1 check (revision > 0)
    )`
} as const;
type Table = keyof typeof OLD_DDL;
const TABLES = Object.keys(OLD_DDL) as Table[];

const COLUMNS: Record<Table, string> = {
  flow_ports: "port_id, flow_id, direction, name, value_type, required, default_value_json, description, sort_key, revision",
  flow_variables: "variable_id, flow_id, name, value_type, initial_value_json, description, sort_key, revision",
  flow_errors: "error_id, flow_id, code, description, metadata_json, revision"
};
const ID: Record<Table, string> = { flow_ports: "port_id", flow_variables: "variable_id", flow_errors: "error_id" };
const squash = (sql: string | null | undefined) => (sql ?? "").replace(/\s+/g, " ").trim().toLowerCase();

async function insertFlow(sql: AutomationStudioSqlExecutor, flowId: string): Promise<void> {
  await sql.run("insert into flows (flow_id, name, scope_kind, visibility, origin, source_mode, status, created_at_ms, updated_at_ms) values (?, ?, 'global', 'private', 'user', 'visual', 'draft', 1, 1)", [flowId, flowId]);
}

/** One row of `table` on `flowId`, `name` its name (a port's or variable's) or code (an error's). */
function insert(sql: AutomationStudioSqlExecutor, table: Table, flowId: string, id: string, name = id, direction: "input" | "output" = "output"): Promise<unknown> {
  if (table === "flow_ports") return sql.run(`insert into flow_ports (${COLUMNS.flow_ports}) values (?, ?, ?, ?, '{"kind":"unknown"}', 1, '"x"', 'kept', '00000001', 3)`, [id, flowId, direction, name]);
  if (table === "flow_variables") return sql.run(`insert into flow_variables (${COLUMNS.flow_variables}) values (?, ?, ?, '{"kind":"number"}', '0', 'kept', '00000001', 3)`, [id, flowId, name]);
  return sql.run(`insert into flow_errors (${COLUMNS.flow_errors}) values (?, ?, ?, 'kept', '{"severity":"high"}', 3)`, [id, flowId, name]);
}

describe("migration 0024_scoped_flow_keys: a port, variable or error id is unique within its Flow", () => {
  let pool: AutomationStudioProjectDatabasePool;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "automation-studio-flow-scoped-keys-migration-test-"));
    pool = new AutomationStudioProjectDatabasePool({ rootDir });
  });
  afterEach(async () => {
    await pool.closeAll();
    await rm(rootDir, { recursive: true, force: true });
  });

  it("is the last of the project migrations, sorting before 0025", () => {
    expect(MIGRATION.id).toBe("0024_scoped_flow_keys");
    expect(AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS.at(-1)).toBe(MIGRATION);
    expect(MIGRATION.id < "0025").toBe(true);
  });

  it("carries every row of an old-key database over unchanged, and then lets two Flows share an id", async () => {
    const lease = await pool.acquire("project.scoped-keys-upgrade");
    try {
      const sql = lease.database;
      await new AutomationStudioSchemaMigrationRunner({ database: sql, migrations: PREVIOUS }).migrate();
      await insertFlow(sql, "flow.a");
      await insertFlow(sql, "flow.b");

      const rows = (table: Table) => sql.all<Record<string, unknown>>(`select ${COLUMNS[table]} from ${table} order by flow_id, ${ID[table]}`);
      const indexes = async (table: Table) => (await sql.all<{ name: string; sql: string | null }>("select name, sql from sqlite_master where type = 'index' and tbl_name = ? order by name", [table])).map((row) => ({ name: row.name, sql: squash(row.sql) || null }));
      const triggers = async (table: Table) => (await sql.all<{ name: string; sql: string }>("select name, sql from sqlite_master where type = 'trigger' and (tbl_name = ? or sql like ?) order by name", [table, `%${table}%`])).map((row) => ({ name: row.name, sql: squash(row.sql) }));
      const before = new Map<Table, { rows: unknown; indexes: unknown; triggers: unknown }>();
      for (const table of TABLES) {
        // The database really is at the old key.
        const created = await sql.get<{ sql: string }>("select sql from sqlite_master where type = 'table' and name = ?", [table]);
        expect(squash(created?.sql)).toBe(squash(OLD_DDL[table]));
        await insert(sql, table, "flow.a", "first", "first", "input");
        await insert(sql, table, "flow.a", "shared");
        await insert(sql, table, "flow.b", "other");
        await expect(insert(sql, table, "flow.b", "shared")).rejects.toThrow(new RegExp(`UNIQUE constraint failed: ${table}\\.${ID[table]}`));
        expect(await rows(table)).toHaveLength(3);
        expect((await triggers(table)).map((row) => row.name)).toEqual([`fk_${table}_flow_id_insert`, `fk_${table}_flow_id_update`]);
        before.set(table, { rows: await rows(table), indexes: await indexes(table), triggers: await triggers(table) });
      }

      await expect(new AutomationStudioSchemaMigrationRunner({ database: sql, migrations: AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS }).migrate())
        .resolves.toMatchObject({ applied: [MIGRATION.id], status: "ready" });

      for (const table of TABLES) {
        await expect(rows(table)).resolves.toEqual(before.get(table)!.rows);
        await expect(indexes(table)).resolves.toEqual(before.get(table)!.indexes);
        await expect(triggers(table)).resolves.toEqual(before.get(table)!.triggers);
        await expect(sql.get("select count(*) as total from sqlite_master where name = ?", [`${table}_scoped_copy`])).resolves.toEqual({ total: 0 });
        const key = await sql.all<{ name: string; pk: number }>(`select name, pk from pragma_table_info('${table}') where pk > 0 order by pk`);
        expect(key).toEqual([{ name: "flow_id", pk: 1 }, { name: ID[table], pk: 2 }]);
        const columns = await sql.all<{ name: string }>(`select name from pragma_table_info('${table}') order by cid`);
        expect(columns.map((column) => column.name).join(", ")).toBe(COLUMNS[table]);

        // The same id on another Flow is now a row of its own.
        await insert(sql, table, "flow.b", "shared");
        await expect(sql.all(`select flow_id from ${table} where ${ID[table]} = 'shared' order by flow_id`)).resolves.toEqual([{ flow_id: "flow.a" }, { flow_id: "flow.b" }]);
        // Within one Flow an id, and the name (or code) the unique index covers, are still unique.
        await expect(insert(sql, table, "flow.b", "shared", "renamed", "input")).rejects.toThrow(new RegExp(`UNIQUE constraint failed: ${table}\\.flow_id, ${table}\\.${ID[table]}`));
        await expect(insert(sql, table, "flow.b", "fresh", "other")).rejects.toThrow(/UNIQUE constraint failed/);
        // The table's guard against a missing Flow came back with it.
        await expect(insert(sql, table, "flow.missing", "orphan")).rejects.toThrow(/missing flows/);
      }

      // A second open finds nothing left to apply.
      await expect(new AutomationStudioSchemaMigrationRunner({ database: sql, migrations: AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS }).migrate())
        .resolves.toMatchObject({ applied: [] });
    } finally {
      await lease.release();
    }
  });
});
