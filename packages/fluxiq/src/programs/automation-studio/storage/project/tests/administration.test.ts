import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS, AutomationStudioProjectAdministration } from "../administration.ts";
import { AutomationStudioProjectDatabasePool } from "../database.ts";
import { AUTOMATION_STUDIO_PROJECT_ADAPTATION_MATCHING_MIGRATION } from "../schema/index.ts";
import { AutomationStudioSchemaMigrationRunner } from "../../schema-migrations.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-project-administration-test");

describe("AutomationStudioProjectAdministration", () => {
  beforeEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(rootDir, { recursive: true });
  });
  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

  it("migrates project administration tables and persists metadata across reopen", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    let admin = await AutomationStudioProjectAdministration.open({ pool, projectId: "project.admin" });
    await expect(admin.meta.put({ name: "Admin Project", description: "Control plane", updatedAt: 1_000 })).resolves.toMatchObject({
      projectId: "project.admin",
      name: "Admin Project",
      revision: 1
    });
    await expect(admin.meta.put({ name: "Conflict" }, 99)).rejects.toThrow(/revision conflict/);
    await admin.close();

    admin = await AutomationStudioProjectAdministration.open({ pool, projectId: "project.admin" });
    await expect(admin.meta.get()).resolves.toMatchObject({ name: "Admin Project", description: "Control plane", revision: 1 });
    await admin.close();
    await pool.closeAll();
  });

  it("appends monotonic change-feed events and filters by entity", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const admin = await AutomationStudioProjectAdministration.open({ pool, projectId: "project.feed" });
    const first = await admin.changeFeed.append({ transactionId: "tx.1", entityKind: "flow", entityId: "flow.1", operation: "create", revision: 1, changedAt: 10 });
    const second = await admin.changeFeed.append({ transactionId: "tx.2", entityKind: "flow", entityId: "flow.1", operation: "update", revision: 2, changedAt: 11 });
    const third = await admin.changeFeed.append({ transactionId: "tx.3", entityKind: "node", entityId: "node.1", operation: "create", revision: 1, changedAt: 12 });
    expect([first.sequence, second.sequence, third.sequence]).toEqual([1, 2, 3]);
    await expect(admin.changeFeed.listAfter(1)).resolves.toMatchObject([{ sequence: 2 }, { sequence: 3 }]);
    await expect(admin.changeFeed.listEntity({ entityKind: "flow", entityId: "flow.1" })).resolves.toMatchObject([{ revision: 1 }, { revision: 2 }]);
    await admin.close();
    await pool.closeAll();
  });

  it("serializes canonical project-scoped change-feed events", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const admin = await AutomationStudioProjectAdministration.open({ pool, projectId: "project.feed.scope" });
    const event = await admin.changeFeed.append({
      transactionId: "tx.scope.1",
      entityKind: "flow",
      entityId: "flow.child",
      operation: "update",
      revision: 3,
      changedAt: 42
    });
    expect(event).toMatchObject({
      projectId: "project.feed.scope",
      sequence: 1,
      entityKind: "flow",
      entityId: "flow.child",
      operation: "update",
      revision: 3,
      changedAt: 42
    });
    await expect(admin.changeFeed.listAfter(0)).resolves.toMatchObject([{ projectId: "project.feed.scope", entityKind: "flow", entityId: "flow.child" }]);
    await admin.close();
    await pool.closeAll();
  });

  it("tracks storage outbox work and ordered background jobs without full scans", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const admin = await AutomationStudioProjectAdministration.open({ pool, projectId: "project.jobs" });
    await admin.storageOutbox.enqueue({ outboxId: "outbox.1", operation: "put_file", stagedPath: "staged/a", finalPath: "objects/a", sha256: "abc", createdAt: 1, updatedAt: 1 });
    await expect(admin.storageOutbox.updateStatus("outbox.1", { status: "in_progress", attemptDelta: 1, updatedAt: 2 })).resolves.toMatchObject({ status: "in_progress", attemptCount: 1 });

    await admin.backgroundJobs.enqueue({ jobId: "job.low", kind: "compile", ownerKind: "flow", ownerId: "flow.1", priority: 1, inputObjectId: null, outputObjectId: null, availableAt: 100, createdAt: 1, updatedAt: 1 });
    await admin.backgroundJobs.enqueue({ jobId: "job.high", kind: "compile", ownerKind: "flow", ownerId: "flow.1", priority: 9, inputObjectId: null, outputObjectId: null, availableAt: 100, createdAt: 2, updatedAt: 2 });
    await admin.backgroundJobs.enqueue({ jobId: "job.future", kind: "compile", ownerKind: "flow", ownerId: "flow.1", priority: 99, inputObjectId: null, outputObjectId: null, availableAt: 200, createdAt: 3, updatedAt: 3 });
    await expect(admin.backgroundJobs.listReady({ now: 100 })).resolves.toMatchObject([{ jobId: "job.high" }, { jobId: "job.low" }]);
    await expect(admin.backgroundJobs.listByOwner({ ownerKind: "flow", ownerId: "flow.1", limit: 2 })).resolves.toHaveLength(2);
    await admin.close();
    await pool.closeAll();
  });

  it("stores resumable migration job cursors as validated JSON", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const admin = await AutomationStudioProjectAdministration.open({ pool, projectId: "project.migration-jobs" });
    await expect(admin.migrationJobs.upsert({ jobId: "migration.1", kind: "legacy_import", cursorJson: "not json", status: "pending", errorJson: null, startedAt: null, completedAt: null })).rejects.toThrow(/valid JSON/);
    await expect(admin.migrationJobs.upsert({ jobId: "migration.1", kind: "legacy_import", cursorJson: '{"offset":10}', status: "running", errorJson: null, startedAt: 1, completedAt: null, updatedAt: 2 })).resolves.toMatchObject({ status: "running", cursorJson: '{"offset":10}' });
    await expect(admin.migrationJobs.list({ status: "running" })).resolves.toMatchObject([{ jobId: "migration.1" }]);
    await admin.close();
    await pool.closeAll();
  });

  it("opens a project database at the 0019 schema and upgrades it to the 0020 adaptation matching columns", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const projectId = "project.upgrade-0020";
    const matching = AUTOMATION_STUDIO_PROJECT_ADAPTATION_MATCHING_MIGRATION.id;
    expect(AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS.map((migration) => migration.id)).toContain(matching);
    const lease = await pool.acquire(projectId);
    await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS.filter((migration) => migration.id < matching) }).migrate();
    await lease.database.run("insert into flows (flow_id, name, scope_kind, visibility, origin, source_mode, status, created_at_ms, updated_at_ms) values ('flow.old', 'Old', 'global', 'private', 'user', 'visual', 'draft', 1, 1)");
    await lease.database.run("insert into objects (object_id, sha256, media_type, byte_count, relative_path, created_at_ms) values ('object:old', 'sha-old', 'application/json', 2, 'objects/old', 1)");
    await lease.database.run("insert into adaptations (adaptation_id, flow_id, base_revision, proposed_revision, trigger, status, risk_level, approval_mode, patch_object_id, created_at_ms, updated_at_ms) values ('adaptation.old', 'flow.old', 1, 2, 'Old trigger.', 'draft', 'low', 'adaptive', 'object:old', 1, 1)");
    await lease.release();

    const admin = await AutomationStudioProjectAdministration.open({ pool, projectId });
    const upgraded = await pool.acquire(projectId);
    const ledger = await upgraded.database.all<{ migration_id: string }>("select migration_id from automation_schema_migrations order by migration_id");
    expect(ledger.map((row) => row.migration_id)).toEqual(AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS.map((migration) => migration.id));
    expect(ledger.at(-1)?.migration_id).toBe(matching);
    await expect(upgraded.database.get("select trigger, failure_signature, confidence_tier, origin_entry_point from adaptations where adaptation_id = 'adaptation.old'"))
      .resolves.toEqual({ trigger: "Old trigger.", failure_signature: null, confidence_tier: null, origin_entry_point: null });
    await upgraded.release();
    await admin.close();
    await pool.closeAll();
  });
});
