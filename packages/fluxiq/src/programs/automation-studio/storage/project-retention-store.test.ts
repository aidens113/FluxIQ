import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectAdministration } from "./project-administration.ts";
import { AutomationStudioProjectContentStore } from "./project-content-store.ts";
import { AutomationStudioProjectDatabasePool } from "./project-database.ts";
import { AutomationStudioProjectEventChunkStore } from "./project-event-chunk-store.ts";
import { AutomationStudioProjectObjectRepository } from "./project-object-repository.ts";
import { AutomationStudioProjectRetentionStore } from "./project-retention-store.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-project-retention-store-test");

describe("AutomationStudioProjectRetentionStore", () => {
  beforeEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(rootDir, { recursive: true });
  });
  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

  it("marks old event chunks archived and enqueues bounded archive jobs", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    await seedRuntime(pool, "project.archive", "flow.1", "run.1");
    const chunks = await AutomationStudioProjectEventChunkStore.open({ pool, projectId: "project.archive" });
    await chunks.writeChunk({ streamKind: "runtime", streamId: "run.1", events: [{ sequence: 1 }, { sequence: 2 }], createdAt: 1 });
    await chunks.writeChunk({ streamKind: "runtime", streamId: "run.1", events: [{ sequence: 3 }, { sequence: 4 }], createdAt: 2 });
    await chunks.close();
    const retention = await AutomationStudioProjectRetentionStore.open({ pool, projectId: "project.archive" });
    const archived = await retention.archiveChunksBeforeSequence({ streamKind: "runtime", streamId: "run.1", beforeOrAtSequence: 2, now: 10, limit: 10 });
    expect(archived).toMatchObject([{ chunkId: "chunk:runtime:run.1:1", lastSequence: 2, archivedAt: 10 }]);
    const admin = await AutomationStudioProjectAdministration.open({ pool, projectId: "project.archive" });
    await expect(admin.backgroundJobs.listByOwner({ ownerKind: "runtime_run", ownerId: "run.1" })).resolves.toMatchObject([{ kind: "archive_event_chunk", inputObjectId: archived[0]!.objectId }]);
    await admin.close();
    await retention.close();
    await pool.closeAll();
  });

  it("sweeps only unreferenced object rows and files", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const content = await AutomationStudioProjectContentStore.open({ pool, projectId: "project.sweep" });
    const kept = await content.putBytes({ content: Buffer.from("keep"), mediaType: "text/plain", extension: "txt", owner: { ownerKind: "flow", ownerId: "flow.1", purpose: "settings" }, createdAt: 1 });
    const removed = await content.putBytes({ content: Buffer.from("remove"), mediaType: "text/plain", extension: "txt", createdAt: 2 });
    await content.close();
    const retention = await AutomationStudioProjectRetentionStore.open({ pool, projectId: "project.sweep" });
    await expect(retention.sweepUnreferencedObjects()).resolves.toEqual({ deleted: [removed.object.objectId] });
    const objects = await AutomationStudioProjectObjectRepository.open({ pool, projectId: "project.sweep" });
    await expect(objects.getById(kept.object.objectId)).resolves.toBeTruthy();
    await expect(objects.getById(removed.object.objectId)).resolves.toBeNull();
    await expect(readFile(kept.contentPath, "utf8")).resolves.toBe("keep");
    await expect(readFile(removed.contentPath, "utf8")).rejects.toThrow();
    await objects.close();
    await retention.close();
    await pool.closeAll();
  }, 15_000);
});

async function seedRuntime(pool: AutomationStudioProjectDatabasePool, projectId: string, flowId: string, runId: string): Promise<void> {
  const admin = await AutomationStudioProjectAdministration.open({ pool, projectId });
  const lease = await pool.acquire(projectId);
  await lease.database.transaction(async (sql) => {
    await sql.run("insert into flows (flow_id, name, scope_kind, visibility, origin, source_mode, status, created_at_ms, updated_at_ms) values (?, 'Flow', 'project', 'project', 'user', 'visual', 'draft', 1, 1)", [flowId]);
    await sql.run("insert into runtime_runs (run_id, flow_id, flow_revision, status, trigger_kind, queued_at_ms, updated_at_ms) values (?, ?, 1, 'running', 'manual', 1, 1)", [runId, flowId]);
  });
  await lease.release();
  await admin.close();
}
