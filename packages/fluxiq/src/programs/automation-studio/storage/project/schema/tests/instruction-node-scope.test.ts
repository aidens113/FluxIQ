import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "../../administration.ts";
import { AutomationStudioProjectDatabasePool } from "../../database.ts";
import { AUTOMATION_STUDIO_PROJECT_INSTRUCTION_NODE_SCOPE_MIGRATION } from "../index.ts";
import { AutomationStudioSchemaMigrationRunner } from "../../../schema-migrations.ts";

// Migration 0026_relaxed_instruction_node_guard drops the guard that tied an
// instruction scope's node id to a `graph_nodes` row (t571). What must hold on
// a database migrated before it: a node scope whose node has no graph row is
// refused before and stored after, rows already there are kept, and the Flow
// guard on the same table still refuses a missing Flow.

let rootDir = "";
const MIGRATION = AUTOMATION_STUDIO_PROJECT_INSTRUCTION_NODE_SCOPE_MIGRATION;
const PREVIOUS = AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS.filter((migration) => migration.id !== MIGRATION.id);

beforeEach(async () => { rootDir = await mkdtemp(path.join(os.tmpdir(), "instruction-node-scope-migration-")); });
afterEach(async () => { await rm(rootDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 }); });

const scopeInsert = "insert into instruction_scopes (instruction_id, scope_kind, project_id, flow_id, router_id, subflow_id, node_id, error_code) values (?, ?, 'project', ?, null, null, ?, null)";

it("stores a node scope whose node has no graph row, and keeps the other guards and rows", async () => {
  const pool = new AutomationStudioProjectDatabasePool({ rootDir });
  const lease = await pool.acquire("project");
  try {
    const sql = lease.database;
    await new AutomationStudioSchemaMigrationRunner({ database: sql, migrations: PREVIOUS }).migrate();
    await sql.run("insert into flows (flow_id, name, scope_kind, created_at_ms, updated_at_ms) values ('flow.a', 'A', 'project', 1, 1)");
    for (const id of ["instruction.kept", "instruction.node"]) {
      await sql.run("insert into instructions (instruction_id, title, requirement, status, priority, content_digest, revision, created_at_ms, updated_at_ms) values (?, ?, 'required', 'active', 1, 'sha256:x', 1, 1, 1)", [id, id]);
    }
    await sql.run(scopeInsert, ["instruction.kept", "flow", "flow.a", null]);
    await expect(sql.run(scopeInsert, ["instruction.node", "node", "flow.a", "node.read"])).rejects.toThrow(/instruction_scopes\.node_id references missing graph_nodes\.node_id/);

    await new AutomationStudioSchemaMigrationRunner({ database: sql, migrations: AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS }).migrate();
    await sql.run(scopeInsert, ["instruction.node", "node", "flow.a", "node.read"]);
    expect(await sql.all("select instruction_id as id, scope_kind as kind, node_id as node from instruction_scopes order by instruction_id")).toEqual([
      { id: "instruction.kept", kind: "flow", node: null },
      { id: "instruction.node", kind: "node", node: "node.read" }
    ]);
    await expect(sql.run(scopeInsert, ["instruction.node", "node", "flow.nowhere", "node.read"])).rejects.toThrow(/instruction_scopes\.flow_id references missing flows\.flow_id/);
    const triggers = (await sql.all<{ name: string }>("select name from sqlite_master where type = 'trigger' and tbl_name = 'instruction_scopes' order by name")).map((row) => row.name);
    expect(triggers.some((name) => name.startsWith("fk_instruction_scopes_node_id"))).toBe(false);
    expect(triggers).toContain("fk_instruction_scopes_flow_id_insert");
  } finally {
    await lease.release();
    await pool.closeAll();
  }
});
