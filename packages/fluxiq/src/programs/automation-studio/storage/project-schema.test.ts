import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectAdministration } from "./project-administration.ts";
import { AutomationStudioProjectDatabasePool } from "./project-database.ts";
import { AUTOMATION_STUDIO_PROJECT_DOMAIN_TABLES, AUTOMATION_STUDIO_PROJECT_SEARCH_TABLES } from "./project-schema.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-project-schema-test");

describe("Automation Studio project domain schema", () => {
  beforeEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(rootDir, { recursive: true });
  });
  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

  it("creates every planned project domain table", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const admin = await AutomationStudioProjectAdministration.open({ pool, projectId: "project.schema" });
    const lease = await pool.acquire("project.schema");
    const rows = await lease.database.all<{ name: string }>("select name from sqlite_master where type = 'table' order by name");
    const names = new Set(rows.map((row) => row.name));
    for (const table of AUTOMATION_STUDIO_PROJECT_DOMAIN_TABLES) expect(names.has(table)).toBe(true);
    for (const table of AUTOMATION_STUDIO_PROJECT_SEARCH_TABLES) expect(names.has(table)).toBe(true);
    await lease.release();
    await admin.close();
    await pool.closeAll();
  });

  it("adds indexed uniqueness and relationship guards for critical resources", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const admin = await AutomationStudioProjectAdministration.open({ pool, projectId: "project.relations" });
    const lease = await pool.acquire("project.relations");
    await lease.database.transaction(async (sql) => {
      await sql.run("insert into objects (object_id, sha256, media_type, byte_count, relative_path, created_at_ms) values ('object.1', 'sha-one', 'application/json', 10, 'objects/one', 1)");
      await sql.run("insert into flows (flow_id, name, scope_kind, visibility, origin, source_mode, status, created_at_ms, updated_at_ms) values ('flow.1', 'One', 'project', 'project', 'user', 'visual', 'draft', 1, 1)");
      await sql.run("insert into graph_partitions (partition_id, flow_id, grid_x, grid_y, min_x, min_y, max_x, max_y, updated_at_ms) values ('partition.1', 'flow.1', 0, 0, 0, 0, 100, 100, 1)");
      await sql.run("insert into graph_nodes (node_id, flow_id, partition_id, definition_id, definition_version, label, x, y, width, height, created_at_ms, updated_at_ms) values ('node.1', 'flow.1', 'partition.1', 'def.action', '1', 'Action', 10, 20, 30, 40, 1, 1)");
      await sql.run("insert into runtime_runs (run_id, flow_id, flow_revision, status, trigger_kind, queued_at_ms, updated_at_ms) values ('run.1', 'flow.1', 1, 'queued', 'manual', 1, 1)");
      await sql.run("insert into runtime_event_chunks (chunk_id, run_id, first_sequence, last_sequence, event_count, byte_count, object_id, sha256, closed, created_at_ms) values ('chunk.1', 'run.1', 1, 5, 5, 100, 'object.1', 'sha-one', 1, 1)");
    });
    await expect(lease.database.run("insert into runtime_event_chunks (chunk_id, run_id, first_sequence, last_sequence, event_count, byte_count, object_id, sha256, closed, created_at_ms) values ('chunk.duplicate', 'run.1', 1, 5, 5, 100, 'object.1', 'sha-one', 1, 1)")).rejects.toThrow();
    await expect(lease.database.run("insert into graph_nodes (node_id, flow_id, partition_id, definition_id, definition_version, label, x, y, width, height, created_at_ms, updated_at_ms) values ('node.bad', 'missing.flow', null, 'def.action', '1', 'Bad', 0, 0, 10, 10, 1, 1)")).rejects.toThrow(/missing/);
    await expect(lease.database.get<{ node_id: string }>("select map.node_id from graph_node_bounds bounds join graph_node_bounds_map map on map.bounds_id = bounds.bounds_id where bounds.min_x <= 10 and bounds.max_x >= 10 and bounds.min_y <= 20 and bounds.max_y >= 20")).resolves.toEqual({ node_id: "node.1" });
    await lease.release();
    await admin.close();
    await pool.closeAll();
  });

  it("accepts bounded row-level resource metadata without hydrating full project JSON", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const admin = await AutomationStudioProjectAdministration.open({ pool, projectId: "project.rows" });
    const lease = await pool.acquire("project.rows");
    await lease.database.transaction(async (sql) => {
      await sql.run("insert into objects (object_id, sha256, media_type, byte_count, relative_path, created_at_ms) values ('object.patch', 'abc', 'application/json', 12, 'objects/a', 1)");
      await sql.run("insert into flows (flow_id, name, scope_kind, visibility, origin, source_mode, status, created_at_ms, updated_at_ms) values ('flow.main', 'Main', 'project', 'project', 'user', 'visual', 'draft', 1, 1)");
      await sql.run("insert into flow_settings (flow_id, execution_defaults_json, training_json, adaptation_json, llm_json, safety_json, updated_at_ms) values ('flow.main', '{}', '{}', '{}', '{}', '{}', 1)");
      await sql.run("insert into routers (router_id, flow_id, fallback_kind, revision, created_at_ms, updated_at_ms) values ('router.main', 'flow.main', 'none', 1, 1, 1)");
      await sql.run("insert into graph_partitions (partition_id, flow_id, grid_x, grid_y, min_x, min_y, max_x, max_y, updated_at_ms) values ('partition.0.0', 'flow.main', 0, 0, 0, 0, 100, 100, 1)");
      await sql.run("insert into graph_nodes (node_id, flow_id, partition_id, definition_id, definition_version, label, x, y, width, height, created_at_ms, updated_at_ms) values ('node.1', 'flow.main', 'partition.0.0', 'def.action', '1', 'Action', 10, 10, 120, 40, 1, 1)");
      await sql.run("insert into graph_edges (edge_id, flow_id, source_node_id, target_node_id, created_at_ms, updated_at_ms) values ('edge.1', 'flow.main', 'node.1', 'node.1', 1, 1)");
      await sql.run("insert into runtime_runs (run_id, flow_id, flow_revision, status, trigger_kind, queued_at_ms, updated_at_ms) values ('run.1', 'flow.main', 1, 'queued', 'manual', 1, 1)");
      await sql.run("insert into runtime_event_chunks (chunk_id, run_id, first_sequence, last_sequence, event_count, byte_count, object_id, sha256, closed, created_at_ms) values ('chunk.1', 'run.1', 1, 10, 10, 100, 'object.patch', 'abc', 1, 1)");
      await sql.run("insert into adaptations (adaptation_id, flow_id, base_revision, proposed_revision, trigger, status, risk_level, approval_mode, patch_object_id, created_at_ms, updated_at_ms) values ('adapt.1', 'flow.main', 1, 2, 'runtime_error', 'approved', 'low', 'adaptive', 'object.patch', 1, 1)");
    });
    await expect(lease.database.get<{ count: number }>("select count(*) as count from graph_nodes where flow_id = 'flow.main'")).resolves.toEqual({ count: 1 });
    await lease.release();
    await admin.close();
    await pool.closeAll();
  });

  it("enforces critical enum and monotonic count checks in the domain tables", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const admin = await AutomationStudioProjectAdministration.open({ pool, projectId: "project.constraints" });
    const lease = await pool.acquire("project.constraints");
    await expect(lease.database.run("insert into flows (flow_id, name, scope_kind, status, created_at_ms, updated_at_ms) values ('flow.bad', 'Bad', 'project', 'unknown', 1, 1)")).rejects.toThrow();
    await expect(lease.database.run("insert into runtime_runs (run_id, flow_id, flow_revision, status, trigger_kind, queued_at_ms, action_count, updated_at_ms) values ('run.bad', 'flow.bad', 1, 'queued', 'manual', 1, -1, 1)")).rejects.toThrow();
    await lease.release();
    await admin.close();
    await pool.closeAll();
  });
});
