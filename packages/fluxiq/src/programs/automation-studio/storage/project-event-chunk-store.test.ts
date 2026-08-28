import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioProjectAdministration } from "./project-administration.ts";
import { AutomationStudioProjectDatabasePool } from "./project-database.ts";
import { AutomationStudioProjectEventChunkStore } from "./project-event-chunk-store.ts";

const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-project-event-chunk-store-test");

describe("AutomationStudioProjectEventChunkStore", () => {
  beforeEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(rootDir, { recursive: true });
  });
  afterEach(async () => rm(rootDir, { recursive: true, force: true }));

  it("writes versioned runtime event chunks with SQL manifests and checksums", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    await seedRuntime(pool, "project.runtime-chunk", "flow.1", "run.1");
    const store = await AutomationStudioProjectEventChunkStore.open({ pool, projectId: "project.runtime-chunk" });
    const record = await store.writeChunk({ streamKind: "runtime", streamId: "run.1", events: [{ sequence: 1, kind: "start" }, { sequence: 2, kind: "action" }], createdAt: 1, transactionId: "tx.runtime" });
    expect(record).toMatchObject({ chunkId: "chunk:runtime:run.1:1", firstSequence: 1, lastSequence: 2, eventCount: 2, closed: true });
    await expect(store.readChunk({ streamKind: "runtime", chunkId: record.chunkId })).resolves.toMatchObject({ document: { schemaVersion: "automation-studio.event-chunk.v1", events: [{ sequence: 1, kind: "start" }, { sequence: 2, kind: "action" }] } });
    await expect(store.writeChunk({ streamKind: "runtime", streamId: "run.1", events: [{ sequence: 1, kind: "duplicate" }], createdAt: 2 })).rejects.toThrow();
    await store.close();
    await pool.closeAll();
  });

  it("writes recording chunks through the same bounded chunk format", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    await seedRecording(pool, "project.recording-chunk", "recording.1");
    const store = await AutomationStudioProjectEventChunkStore.open({ pool, projectId: "project.recording-chunk" });
    const record = await store.writeChunk({ streamKind: "recording", streamId: "recording.1", events: [{ sequence: 5, kind: "observe" }, { sequence: 6, kind: "click" }], createdAt: 1 });
    await expect(store.readChunk({ streamKind: "recording", chunkId: record.chunkId })).resolves.toMatchObject({ record: { streamKind: "recording", streamId: "recording.1", firstSequence: 5, lastSequence: 6 } });
    await store.close();
    await pool.closeAll();
  });

  it("rejects oversized and non-contiguous chunks before writing manifests", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    await seedRuntime(pool, "project.chunk-bounds", "flow.1", "run.1");
    const store = await AutomationStudioProjectEventChunkStore.open({ pool, projectId: "project.chunk-bounds" });
    await expect(store.writeChunk({ streamKind: "runtime", streamId: "run.1", events: [{ sequence: 1 }, { sequence: 3 }] })).rejects.toThrow(/contiguous/);
    await expect(store.writeChunk({ streamKind: "runtime", streamId: "run.1", events: [{ sequence: 1 }, { sequence: 2 }], maxEvents: 1 })).rejects.toThrow(/too many/);
    await expect(store.writeChunk({ streamKind: "runtime", streamId: "run.1", events: [{ sequence: 1, payload: "x".repeat(100) }], maxBytes: 50 })).rejects.toThrow(/exceeds/);
    await expect(store.getChunk({ streamKind: "runtime", chunkId: "chunk:runtime:run.1:1" })).resolves.toBeNull();
    await store.close();
    await pool.closeAll();
  });

  it("reads bounded event pages by sequence and event time", async () => {
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    await seedRuntime(pool, "project.event-pages", "flow.1", "run.1");
    const store = await AutomationStudioProjectEventChunkStore.open({ pool, projectId: "project.event-pages" });
    await store.writeChunk({ streamKind: "runtime", streamId: "run.1", events: [{ sequence: 1, timestampMs: 10 }, { sequence: 2, timestampMs: 20 }], createdAt: 1 });
    await store.writeChunk({ streamKind: "runtime", streamId: "run.1", events: [{ sequence: 3, timestampMs: 30 }, { sequence: 4, timestampMs: 40 }], createdAt: 2 });
    await store.writeChunk({ streamKind: "runtime", streamId: "run.1", events: [{ sequence: 5, timestampMs: 50 }], createdAt: 3 });
    const bySequence = await store.readEventsBySequence({ streamKind: "runtime", streamId: "run.1", afterSequence: 2, limit: 2 });
    expect(bySequence).toMatchObject({ events: [{ sequence: 3 }, { sequence: 4 }], hasMore: true, nextCursor: "4" });
    const byTime = await store.readEventsByTime({ streamKind: "runtime", streamId: "run.1", fromTimeMs: 25, limit: 2 });
    expect(byTime.events.map((event) => event.sequence)).toEqual([3, 4]);
    expect(byTime.hasMore).toBe(true);
    const nextByTime = await store.readEventsByTime({ streamKind: "runtime", streamId: "run.1", fromTimeMs: 25, cursor: byTime.nextCursor, limit: 2 });
    expect(nextByTime.events.map((event) => event.sequence)).toEqual([5]);
    await store.close();
    await pool.closeAll();
  });
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

async function seedRecording(pool: AutomationStudioProjectDatabasePool, projectId: string, recordingId: string): Promise<void> {
  const admin = await AutomationStudioProjectAdministration.open({ pool, projectId });
  const lease = await pool.acquire(projectId);
  await lease.database.run("insert into recordings (recording_id, name, status, started_at_ms, updated_at_ms) values (?, 'Recording', 'recording', 1, 1)", [recordingId]);
  await lease.release();
  await admin.close();
}
