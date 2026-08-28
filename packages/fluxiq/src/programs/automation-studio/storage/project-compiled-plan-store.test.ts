import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectCompiledPlanStore } from "./project-compiled-plan-store.ts";
import { AutomationStudioProjectDatabasePool } from "./project-database.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-project-compiled-plan-store-test");

describe("AutomationStudioProjectCompiledPlanStore", () => {
  let pools: AutomationStudioProjectDatabasePool[] = [];

  beforeEach(async () => {
    pools = [];
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(rootDir, { recursive: true });
  });
  afterEach(async () => {
    await Promise.all(pools.map((pool) => pool.closeAll().catch(() => undefined)));
    await rm(rootDir, { recursive: true, force: true });
  });

  it("compiles a fixed graph revision into a deterministic immutable object manifest", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    pools.push(pool);
    const store = await AutomationStudioProjectCompiledPlanStore.open({ pool, projectId: "project.compile" });
    await seedCompiledFlow(pool, "project.compile", { graphRevision: 3 });

    const first = await store.compileFlowRevision({ flowId: "flow.main", flowRevision: 3, compiledAt: 100 });
    const second = await store.compileFlowRevision({ flowId: "flow.main", flowRevision: 3, compiledAt: 200 });

    expect(second).toEqual(first);
    expect(first.status).toBe("ready");
    expect(first.artifactId).toBe("compiled:flow.main:3:compiled-plan.v1");
    const loaded = await store.loadCompiledPlan(first.artifactId);
    expect(loaded.plan).toMatchObject({ schemaVersion: "automation-studio.compiled-plan.v1", flowId: "flow.main", flowRevision: 3, graphRevision: 3, settingsRevision: 5 });
    expect(loaded.plan.nodes.map((node) => node.id)).toEqual(["node.end", "node.start"]);
    expect(loaded.plan.resolvedInstructions.map((instruction) => instruction.instructionId)).toEqual(["instruction.flow"]);
    expect(loaded.plan.provenance).toMatchObject({ graphRevisionId: "revision.3", graphDigest: "graph-digest-3", nodeCount: 2, edgeCount: 1 });
    await store.close();
    await pool.closeAll();
  });

  it("processes compile work through background jobs and records safe-point adoption", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    pools.push(pool);
    const store = await AutomationStudioProjectCompiledPlanStore.open({ pool, projectId: "project.jobs" });
    await seedCompiledFlow(pool, "project.jobs", { graphRevision: 1 });
    await store.enqueueCompileJob({ flowId: "flow.main", flowRevision: 1, priority: 10, createdAt: 10 });
    const manifest = await store.processNextCompileJob({ now: 20 });
    expect(manifest).toMatchObject({ artifactId: "compiled:flow.main:1:compiled-plan.v1", status: "ready" });

    const run = await store.startRunFromArtifact({ artifactId: manifest!.artifactId, runId: "run.1", startedAt: 30, options: { now: deterministicNow(30) } });
    expect(run.trace.status).toBe("succeeded");
    await expect(store.recordSafePointAdoption({ adoptionId: "adoption.1", runId: "run.1", fromArtifactId: manifest!.artifactId, toArtifactId: manifest!.artifactId, safePointSequence: 2, reason: "approved adaptation", adoptedAt: 40 })).resolves.toMatchObject({ runId: "run.1", safePointSequence: 2, reason: "approved adaptation" });

    const lease = await pool.acquire("project.jobs");
    await expect(lease.database.get<{ status: string; output_object_id: string }>("select status, output_object_id from background_jobs where job_id = ?", ["job:compiled:flow.main:1:compiled-plan.v1"])).resolves.toMatchObject({ status: "done", output_object_id: manifest!.objectId });
    await lease.release();
    await store.close();
    await pool.closeAll();
  });

  it("starts a run from a loaded artifact without querying mutable editor graph tables", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    pools.push(pool);
    const seenSql: string[] = [];
    const store = await AutomationStudioProjectCompiledPlanStore.open({ pool, projectId: "project.runtime", onSql: (sql) => seenSql.push(sql) });
    await seedCompiledFlow(pool, "project.runtime", { graphRevision: 4 });
    const manifest = await store.compileFlowRevision({ flowId: "flow.main", flowRevision: 4, compiledAt: 100 });
    const loaded = await store.loadCompiledPlan(manifest.artifactId);

    seenSql.length = 0;
    const result = await store.startRunFromLoadedPlan({ loaded, runId: "run.compiled", startedAt: 500, options: { now: deterministicNow(500) } });

    expect(result.trace.status).toBe("succeeded");
    expect(seenSql.join("\n")).not.toMatch(/\b(graph_nodes|graph_edges|graph_partitions|graph_revisions|flow_settings|instructions|instruction_scopes|instruction_bindings)\b/i);
    expect(seenSql.join("\n")).toMatch(/runtime_runs/i);
    const replay = await store.startRunFromLoadedPlan({ loaded, runId: "run.compiled.replay", startedAt: 500, options: { now: deterministicNow(500) } });
    expect(replay.trace).toMatchObject({
      status: result.trace.status,
      attempts: result.trace.attempts.map((attempt) => ({ nodeId: attempt.nodeId, definitionId: attempt.definitionId, status: attempt.status, route: attempt.route, outputs: attempt.outputs }))
    });
    await store.close();
    await pool.closeAll();
  });

  it("keeps compiled-plan digest cache bounded", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    pools.push(pool);
    const store = await AutomationStudioProjectCompiledPlanStore.open({ pool, projectId: "project.cache", maxCachedBytes: 1 });
    await seedCompiledFlow(pool, "project.cache", { graphRevision: 1 });
    const manifest = await store.compileFlowRevision({ flowId: "flow.main", flowRevision: 1, compiledAt: 100 });
    expect(store.cacheStats()).toMatchObject({ entries: 0, maxBytes: 1 });
    const loaded = await store.loadCompiledPlan(manifest.artifactId);
    expect(loaded.cached).toBe(false);
    expect(store.cacheStats()).toMatchObject({ entries: 0, maxBytes: 1 });
    await store.close();
    await pool.closeAll();
  });
});

async function seedCompiledFlow(pool: AutomationStudioProjectDatabasePool, projectId: string, input: { graphRevision: number }): Promise<void> {
  const lease = await pool.acquire(projectId);
  await lease.database.transaction(async (sql) => {
    await sql.run("insert into flows (flow_id, name, description, scope_kind, scope_id, visibility, origin, source_mode, status, graph_revision, settings_revision, created_at_ms, updated_at_ms) values ('flow.main', 'Main', '', 'project', ?, 'project', 'user', 'visual', 'active', ?, 5, 1, 1)", [projectId, input.graphRevision]);
    await sql.run("insert into flow_settings (flow_id, execution_defaults_json, training_json, adaptation_json, llm_json, safety_json, revision, updated_at_ms) values ('flow.main', ?, ?, ?, ?, ?, 5, 1)", [JSON.stringify({ timeoutMs: 1000 }), JSON.stringify({ mode: "adaptive" }), JSON.stringify({ policy: "default" }), JSON.stringify({ provider: "host" }), JSON.stringify({ approval: "required" })]);
    await sql.run("insert into graph_nodes (node_id, flow_id, definition_id, definition_version, label, x, y, width, height, parameter_values_json, metadata_json, revision, created_at_ms, updated_at_ms) values ('node.start', 'flow.main', 'builtin.control.start', '1.0.0', 'Start', 0, 0, 100, 40, ?, ?, ?, 1, 1)", [JSON.stringify({ emitTimestamp: false }), JSON.stringify({}), input.graphRevision]);
    await sql.run("insert into graph_nodes (node_id, flow_id, definition_id, definition_version, label, x, y, width, height, parameter_values_json, metadata_json, revision, created_at_ms, updated_at_ms) values ('node.end', 'flow.main', 'builtin.control.end', '1.0.0', 'End', 200, 0, 100, 40, ?, ?, ?, 1, 1)", [JSON.stringify({ resultStatus: "success", message: "done" }), JSON.stringify({}), input.graphRevision]);
    await sql.run("insert into graph_edges (edge_id, flow_id, source_node_id, target_node_id, source_port_id, target_port_id, label, metadata_json, revision, created_at_ms, updated_at_ms) values ('edge.start.end', 'flow.main', 'node.start', 'node.end', 'success', 'in', '', ?, ?, 1, 1)", [JSON.stringify({}), input.graphRevision]);
    await sql.run("insert into graph_revisions (revision_id, flow_id, revision_number, parent_revision, source, operation_count, digest, message, created_at_ms) values (?, 'flow.main', ?, null, 'test', 3, ?, 'seed', 1)", [`revision.${input.graphRevision}`, input.graphRevision, `graph-digest-${input.graphRevision}`]);
    await sql.run("insert into instructions (instruction_id, title, inline_body, requirement, status, priority, content_digest, revision, created_at_ms, updated_at_ms) values ('instruction.flow', 'Use plan', 'Stay deterministic.', 'required', 'active', 10, 'instruction-digest', 7, 1, 1)");
    await sql.run("insert into instruction_scopes (instruction_id, scope_kind, project_id, flow_id) values ('instruction.flow', 'flow', ?, 'flow.main')", [projectId]);
  });
  await lease.release();
}

function deterministicNow(start: number): () => number {
  let current = start;
  return () => current++;
}
