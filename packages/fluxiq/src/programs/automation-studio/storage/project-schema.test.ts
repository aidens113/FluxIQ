import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS, AutomationStudioProjectAdministration } from "./project-administration.ts";
import { AutomationStudioProjectDatabasePool } from "./project-database.ts";
import { AutomationStudioProjectFlowResourceRepository } from "./project-flow-resource-repository.ts";
import { AUTOMATION_STUDIO_PROJECT_DOMAIN_TABLES, AUTOMATION_STUDIO_PROJECT_INTERVENTION_MODE_MIGRATION, AUTOMATION_STUDIO_PROJECT_RUNTIME_SUMMARY_ENVELOPE_MIGRATION, AUTOMATION_STUDIO_PROJECT_SEARCH_TABLES } from "./project-schema.ts";
import { AutomationStudioSchemaMigrationRunner } from "./schema-migrations.ts";

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

  it("installs Router/runtime paging indexes and additive summary columns", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const admin = await AutomationStudioProjectAdministration.open({ pool, projectId: "project.paging-schema" });
    const lease = await pool.acquire("project.paging-schema");
    const indexes = await lease.database.all<{ name: string }>("select name from sqlite_master where type = 'index' and name in ('subflows_target_lookup_idx', 'router_routes_page_idx', 'router_routes_target_page_idx', 'router_groups_order_idx', 'runtime_action_summaries_page_idx', 'runtime_action_summaries_status_idx') order by name");
    expect(indexes.map((row) => row.name)).toEqual(["router_groups_order_idx", "router_routes_page_idx", "router_routes_target_page_idx", "runtime_action_summaries_page_idx", "runtime_action_summaries_status_idx", "subflows_target_lookup_idx"]);
    const groupColumns = await lease.database.all<{ name: string }>("pragma table_info(router_groups)");
    expect(groupColumns.map((column) => column.name)).toEqual(expect.arrayContaining(["description", "order_value", "status", "collapsed", "created_at_ms", "updated_at_ms", "metadata_json"]));
    const actionColumns = await lease.database.all<{ name: string }>("pragma table_info(runtime_action_summaries)");
    expect(actionColumns.map((column) => column.name)).toEqual(expect.arrayContaining(["definition_id", "route", "comparison_status", "message_summary", "detail_json"]));
    await lease.release();
    await admin.close();
    await pool.closeAll();
  });

  it("installs canonical intervention columns and their paging index", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const admin = await AutomationStudioProjectAdministration.open({ pool, projectId: "project.intervention-schema" });
    const lease = await pool.acquire("project.intervention-schema");
    const columns = await lease.database.all<{ name: string }>("pragma table_info(flow_settings)");
    expect(columns.map((column) => column.name)).toEqual(expect.arrayContaining(["intervention_mode", "intervention_mode_version"]));
    await expect(lease.database.get<{ name: string }>("select name from sqlite_master where type = 'index' and name = 'flow_settings_intervention_mode_idx'")).resolves.toEqual({ name: "flow_settings_intervention_mode_idx" });
    await expect(lease.database.run("insert into flows (flow_id, name, scope_kind, status, created_at_ms, updated_at_ms) values ('flow.mode', 'Mode', 'global', 'draft', 1, 1)")).resolves.toMatchObject({ changes: 1 });
    await expect(lease.database.run("insert into flow_settings (flow_id, intervention_mode, intervention_mode_version, updated_at_ms) values ('flow.mode', 'unsupported', 1, 1)")).rejects.toThrow();
    await lease.release(); await admin.close(); await pool.closeAll();
  });

  it("migrates legacy rows additively and rolls back every 0014 statement on failure", async () => {
    const baseline = AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS.filter((migration) => migration.id < AUTOMATION_STUDIO_PROJECT_INTERVENTION_MODE_MIGRATION.id);
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const legacyLease = await pool.acquire("project.legacy-mode");
    await new AutomationStudioSchemaMigrationRunner({ database: legacyLease.database, migrations: baseline }).migrate();
    await legacyLease.database.run("insert into flows (flow_id, name, scope_kind, visibility, origin, source_mode, status, created_at_ms, updated_at_ms) values ('flow.legacy', 'Legacy', 'global', 'private', 'user', 'visual', 'draft', 1, 1)");
    await legacyLease.database.run("insert into flow_settings (flow_id, execution_defaults_json, training_json, adaptation_json, llm_json, safety_json, revision, updated_at_ms) values (?, ?, ?, ?, ?, ?, ?, ?)", ["flow.legacy", "{}", "{}", JSON.stringify({ proposalMode: "manual" }), "{}", "{}", 1, 1]);
    await new AutomationStudioSchemaMigrationRunner({ database: legacyLease.database, migrations: AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS }).migrate();
    await expect(legacyLease.database.get("select intervention_mode, intervention_mode_version from flow_settings where flow_id = 'flow.legacy'")).resolves.toEqual({ intervention_mode: null, intervention_mode_version: 0 });
    await expect(legacyLease.database.get("select migration_id from automation_schema_migrations where migration_id = '0014_canonical_intervention_mode'")).resolves.toEqual({ migration_id: "0014_canonical_intervention_mode" });
    await legacyLease.release();
    const legacyRepository = await AutomationStudioProjectFlowResourceRepository.open({ pool, projectId: "project.legacy-mode" });
    await expect(legacyRepository.getFlow("flow.legacy")).resolves.toMatchObject({ settings: { interventionMode: "manual_approval", interventionModeVersion: 1 } });
    await legacyRepository.upsertFlow({ flowId: "flow.legacy", parentFlowId: null, owningSubflowId: null, name: "Legacy", description: "", scopeKind: "global", scopeId: null, visibility: "private", origin: "user", sourceMode: "visual", status: "draft", compiledRevision: null, settings: { interventionMode: "manual_approval", interventionModeVersion: 1 } }, 1);
    await legacyRepository.close();
    const upgradedLease = await pool.acquire("project.legacy-mode");
    await expect(upgradedLease.database.get("select intervention_mode, intervention_mode_version from flow_settings where flow_id = 'flow.legacy'")).resolves.toEqual({ intervention_mode: "manual_approval", intervention_mode_version: 1 });
    await upgradedLease.release();

    const rollbackLease = await pool.acquire("project.mode-rollback");
    await new AutomationStudioSchemaMigrationRunner({ database: rollbackLease.database, migrations: baseline }).migrate();
    await expect(new AutomationStudioSchemaMigrationRunner({ database: rollbackLease.database, migrations: [...baseline, { id: "0014_canonical_intervention_mode", statements: [AUTOMATION_STUDIO_PROJECT_INTERVENTION_MODE_MIGRATION.statements[0]!, "this is invalid sql"] }] }).migrate()).rejects.toThrow();
    const rollbackColumns = await rollbackLease.database.all<{ name: string }>("pragma table_info(flow_settings)");
    expect(rollbackColumns.some((column) => column.name === "intervention_mode")).toBe(false);
    await expect(rollbackLease.database.get("select migration_id from automation_schema_migrations where migration_id = '0014_canonical_intervention_mode'")).resolves.toBeUndefined();
    await rollbackLease.release(); await pool.closeAll();
  });

  it("adds a compact runtime summary envelope without rewriting legacy rows", async () => {
    const baseline = AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS.filter((migration) => migration.id < AUTOMATION_STUDIO_PROJECT_RUNTIME_SUMMARY_ENVELOPE_MIGRATION.id);
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const lease = await pool.acquire("project.runtime-summary-migration");
    await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: baseline }).migrate();
    await lease.database.run("insert into flows (flow_id, name, scope_kind, visibility, origin, source_mode, status, created_at_ms, updated_at_ms) values ('flow.legacy-run', 'Legacy', 'global', 'private', 'user', 'visual', 'draft', 1, 1)");
    await lease.database.run("insert into runtime_runs (run_id, flow_id, flow_revision, status, trigger_kind, queued_at_ms, updated_at_ms) values ('run.legacy', 'flow.legacy-run', 1, 'queued', 'manual', 1, 1)");
    await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS }).migrate();
    await expect(lease.database.get("select summary_json from runtime_runs where run_id = 'run.legacy'")).resolves.toEqual({ summary_json: "{}" });
    await lease.release(); await pool.closeAll();
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
