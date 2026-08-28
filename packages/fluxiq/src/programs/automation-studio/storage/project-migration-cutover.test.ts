import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectDatabasePool } from "./project-database.ts";
import {
  AUTOMATION_STUDIO_RETIRED_ACTIVE_JSON_INDEXES,
  AutomationStudioProjectMigrationCutoverStore,
  assertAutomationStudioReadPathDoesNotRepair,
  buildAutomationStudioLegacyMigrationOperations,
  compareAutomationStudioHybridRead,
  createAutomationStudioVerifiedBackupManifest,
  inventoryAutomationStudioLegacyProject,
  resolveAutomationStudioV2Feature,
  runAutomationStudioLegacyImporterBatch,
  runAutomationStudioLegacyMigrationOrchestration,
  verifyAutomationStudioBackupManifest,
  verifyAutomationStudioV2Migration,
  type AutomationStudioLegacyInventoryManifest
} from "./project-migration-cutover.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-project-migration-cutover-test");

describe("Automation Studio Phase 11 migration cutover", () => {
  beforeEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(path.join(rootDir, "projects", "project.cutover"), { recursive: true });
  });

  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

  it("creates inventory and verified backup manifests with change detection", async () => {
    await writeLegacyFixtureFiles();
    const inventory = await inventoryAutomationStudioLegacyProject({ rootDir, projectId: "project.cutover", includeContentDigests: true, now: 10 });
    expect(inventory.resourceCounts.project_catalog).toBe(1);
    expect(inventory.resourceCounts.flow_documents).toBeGreaterThanOrEqual(1);
    expect(inventory.resourceCounts.runtime_events).toBe(1);
    expect(inventory.resourceCounts.recording_events).toBe(1);
    expect(inventory.resourceCounts.object_index).toBe(1);
    expect(inventory.resources.every((resource) => resource.sha256)).toBe(true);

    const backup = await createAutomationStudioVerifiedBackupManifest({ rootDir, projectId: "project.cutover", backupId: "backup.verified", now: 11 });
    await expect(verifyAutomationStudioBackupManifest({ rootDir, manifest: backup, now: 12 })).resolves.toMatchObject({ ok: true, missing: [], changed: [] });

    await writeFile(path.join(rootDir, "projects", "project.cutover", "flows", "flow.one", "flow.json"), JSON.stringify({ changed: true }), "utf8");
    const changed = await verifyAutomationStudioBackupManifest({ rootDir, manifest: backup, now: 13 });
    expect(changed.ok).toBe(false);
    expect(changed.changed.map((item) => item.relativePath)).toContain("projects/project.cutover/flows/flow.one/flow.json");
  });

  it("persists resumable importer cursors and v2 cutover state", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const store = await AutomationStudioProjectMigrationCutoverStore.open({ pool, projectId: "project.cutover" });
    const calls: number[] = [];
    const first = await runAutomationStudioLegacyImporterBatch({
      store,
      resourceKind: "instructions",
      resourceId: "legacy.instructions",
      items: ["a", "b", "c"],
      batchSize: 2,
      importItem: async (_item, index) => {
        calls.push(index);
        return index === 1 ? "skipped" : "imported";
      }
    });
    expect(first).toMatchObject({ status: "pending", importedCount: 1, skippedCount: 1, nextIndex: 2 });

    const second = await runAutomationStudioLegacyImporterBatch({ store, resourceKind: "instructions", resourceId: "legacy.instructions", items: ["a", "b", "c"], batchSize: 2, importItem: async (_item, index) => { calls.push(index); return "imported"; } });
    expect(second).toMatchObject({ status: "done", importedCount: 2, skippedCount: 1, nextIndex: 3 });
    expect(calls).toEqual([0, 1, 2]);

    const enabled = await store.enableV2ForNewProjects("new only", 20);
    expect(resolveAutomationStudioV2Feature({ state: enabled, newProject: true })).toBe(true);
    expect(resolveAutomationStudioV2Feature({ state: enabled, newProject: false })).toBe(false);
    await expect(store.makeV2Default("cutover", 21)).resolves.toMatchObject({ state: "default", defaultEnabled: true, previousState: { state: "enabled" } });
    await expect(store.rollbackV2("bad soak", 22)).resolves.toMatchObject({ state: "rolled_back", defaultEnabled: false });
    expect(resolveAutomationStudioV2Feature({ state: await store.getFeatureState(), newProject: true })).toBe(false);
    await store.close();
    await pool.closeAll();
  });

  it("orders graph split, stream chunking, and object reference migration orchestration", async () => {
    await writeLegacyFixtureFiles();
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const result = await runAutomationStudioLegacyMigrationOrchestration({ rootDir, pool, projectId: "project.cutover", backup: true, batchSize: 500, now: 30 });
    const operationKinds = result.operations.map((operation) => operation.operationKind);
    expect(operationKinds).toContain("graph_split");
    expect(operationKinds).toContain("runtime_stream_chunk");
    expect(operationKinds).toContain("recording_stream_chunk");
    expect(operationKinds).toContain("object_reference");
    expect(operationKinds.indexOf("object_reference")).toBeLessThan(operationKinds.indexOf("graph_split"));
    expect(result.objectMigration).toMatchObject({ importedObjects: 1, importedReferences: 1 });

    const store = await AutomationStudioProjectMigrationCutoverStore.open({ pool, projectId: "project.cutover" });
    await expect(store.listManifests({ kind: "backup" })).resolves.toHaveLength(1);
    await expect(store.sql.get<{ count: number }>("select count(*) as count from objects")).resolves.toMatchObject({ count: 3 });
    await expect(store.sql.get<{ count: number }>("select count(*) as count from graph_revisions where flow_id = 'flow.one'")).resolves.toMatchObject({ count: 1 });
    await expect(store.sql.get<{ count: number }>("select count(*) as count from runtime_event_chunks where run_id = 'run.one'")).resolves.toMatchObject({ count: 1 });
    await expect(store.sql.get<{ count: number }>("select count(*) as count from recording_event_chunks where recording_id = 'recording.one'")).resolves.toMatchObject({ count: 1 });
    await store.close();
    await pool.closeAll();
  });

  it("reports count and semantic verification plus read-only hybrid diagnostics", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const store = await AutomationStudioProjectMigrationCutoverStore.open({ pool, projectId: "project.cutover" });
    await store.sql.run("insert into flows (flow_id, name, scope_kind, visibility, origin, source_mode, status, created_at_ms, updated_at_ms) values (?, ?, 'global', 'private', 'user', 'visual', 'draft', 1, 1)", ["flow.one", "Flow One"]);
    const report = await verifyAutomationStudioV2Migration({ sql: store.sql, projectId: "project.cutover", legacyInventory: legacyInventoryWithCounts({ flow_documents: 2 }), now: 40 });
    expect(report.ok).toBe(false);
    expect(report.countMismatches).toEqual([{ resourceKind: "flow_documents", legacyCount: 2, v2Count: 1 }]);

    const matching = await compareAutomationStudioHybridRead({ ownerKind: "flow", ownerId: "flow.one", sql: store.sql, now: 41, legacyRead: async () => ({ id: "flow.one", name: "Flow One" }), v2Read: async () => ({ name: "Flow One", id: "flow.one" }) });
    expect(matching).toMatchObject({ match: true, readOnly: true, diagnostics: [] });
    const mismatch = await compareAutomationStudioHybridRead({ ownerKind: "flow", ownerId: "flow.one", sql: store.sql, legacyRead: async () => ({ id: "flow.one" }), v2Read: async () => ({ id: "flow.two" }) });
    expect(mismatch.diagnostics).toContain("hybrid_read.digest_mismatch");

    expect(AUTOMATION_STUDIO_RETIRED_ACTIVE_JSON_INDEXES).toContain("indexes/flows.json");
    expect(() => assertAutomationStudioReadPathDoesNotRepair("repair-recording-state-index")).toThrow(/retired/);
    await store.close();
    await pool.closeAll();
  });
});

async function writeLegacyFixtureFiles(): Promise<void> {
  await mkdir(path.join(rootDir, "projects", "project.cutover", "flows", "flow.one"), { recursive: true });
  await mkdir(path.join(rootDir, "projects", "project.cutover", "runtime", "run.one"), { recursive: true });
  await mkdir(path.join(rootDir, "projects", "project.cutover", "recordings", "recording.one"), { recursive: true });
  await mkdir(path.join(rootDir, "projects", "project.cutover", "indexes"), { recursive: true });
  await writeFile(path.join(rootDir, "projects", "index.json"), JSON.stringify({ projects: [{ id: "project.cutover", name: "Cutover", createdAt: 1, updatedAt: 1 }] }), "utf8");
  await writeFile(path.join(rootDir, "projects", "project.cutover", "hierarchy.json"), JSON.stringify({ customHierarchyNodes: [] }), "utf8");
  await writeFile(path.join(rootDir, "projects", "project.cutover", "flows", "flow.one", "flow.json"), JSON.stringify({ flowId: "flow.one", nodes: [], edges: [] }), "utf8");
  await writeFile(path.join(rootDir, "projects", "project.cutover", "runtime", "run.one", "events.jsonl"), '{"sequence":1}\n', "utf8");
  await writeFile(path.join(rootDir, "projects", "project.cutover", "recordings", "recording.one", "events.jsonl"), '{"sequence":1}\n', "utf8");
  await writeFile(path.join(rootDir, "projects", "project.cutover", "instructions.json"), "[]", "utf8");
  await writeFile(path.join(rootDir, "projects", "project.cutover", "subflows.json"), "[]", "utf8");
  await writeFile(path.join(rootDir, "projects", "project.cutover", "indexes", "objects.json"), JSON.stringify({ schemaVersion: "0.1", objects: [{ sha256: "a".repeat(64), mediaType: "application/json", size: 2, owner: { kind: "project" }, relativePath: "objects/a.json", createdAt: 1 }] }), "utf8");
}

function legacyInventoryWithCounts(counts: Partial<Record<keyof AutomationStudioLegacyInventoryManifest["resourceCounts"], number>>): AutomationStudioLegacyInventoryManifest {
  const resourceCounts = {
    project_catalog: 0,
    project_hierarchy: 0,
    flow_documents: 0,
    subflows: 0,
    router_maps: 0,
    instructions: 0,
    adaptations: 0,
    runtime_runs: 0,
    runtime_events: 0,
    recordings: 0,
    recording_events: 0,
    state_index: 0,
    object_index: 0,
    settings: 0,
    publications: 0,
    ...counts
  };
  return { schemaVersion: "automation-studio.legacy-inventory.v1", projectId: "project.cutover", createdAt: 1, rootRelativePath: "projects/project.cutover", resources: [], resourceCounts, fileCount: 0, totalBytes: 0, digest: `sha256:${"0".repeat(64)}` };
}
