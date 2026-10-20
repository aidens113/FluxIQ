// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRecordingSession, appendRecordingEntry } from "../../../../model/index.ts";
import { AutomationStudioProjectAdministration } from "../../administration.ts";
import { AutomationStudioProjectDatabasePool, type AutomationStudioProjectDatabaseLease } from "../../database.ts";
import { AutomationStudioProjectEventChunkStore } from "../../event-chunk-store.ts";
import { AutomationStudioProjectRuntimeStreamStore } from "../../runtime-stream-store.ts";

describe("finalized legacy recording reconciliation", () => {
  const roots: string[] = [];
  const pools: AutomationStudioProjectDatabasePool[] = [];
  const stores: AutomationStudioProjectRuntimeStreamStore[] = [];
  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(stores.splice(0).map(store => store.close()));
    await Promise.all(pools.splice(0).map(pool => pool.closeAll()));
    await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
  });
  async function setup() {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-recording-reconcile-"));
    roots.push(root);
    const pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
    pools.push(pool);
    const admin = await AutomationStudioProjectAdministration.open({ pool, projectId: "project.unit" });
    await admin.close();
    const store = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: "project.unit" });
    stores.push(store);
    const base = createRecordingSession({ recordingId: "recording.unit", startedAt: 1, initialState: { timestamp: 1, namespaces: {} } });
    const first = appendRecordingEntry(base, { id: "entry.a", type: "marker", label: "unit a", timestamp: 2 });
    const full = { ...appendRecordingEntry(first, { id: "entry.b", type: "marker", label: "unit b", timestamp: 3 }), endedAt: 99 };
    await store.upsertRecordingSummary(base);
    const chunks = await AutomationStudioProjectEventChunkStore.open({ pool, projectId: "project.unit" });
    try { await chunks.writeChunk({ streamKind: "recording", streamId: full.recordingId, events: full.timeline.slice(1) }); }
    finally { await chunks.close(); }
    await store.upsertRecordingSummary(full);
    const database = (store as unknown as { lease: AutomationStudioProjectDatabaseLease }).lease.database;
    return { store, full, database };
  }
  it("backfills proven finalized legacy split data without reopening or rewriting existing chunks", async () => {
    const { store, full, database } = await setup();
    const old = await database.get("select * from recording_event_chunks where first_sequence = 1");
    await store.putRecording(full);
    expect(await store.readRecordingTimeline(full.recordingId)).toEqual(full.timeline);
    expect(await store.getRecordingCompletion(full.recordingId)).toEqual({ ended_at_ms: 99, event_count: 2 });
    expect(await database.get("select * from recording_event_chunks where first_sequence = 1")).toEqual(old);
    await expect(store.appendRecordingEvents({ recordingId: full.recordingId, events: [] })).rejects.toThrow(/immutable/);
    expect(await database.get("select count(*) as total from recording_stream_reconciliations")).toEqual({ total: 0 });
  });
  it.each(["sha", "end", "generation", "cursor", "proof"])("refuses a counterfeit or stale exact reconciliation claim (%s)", async kind => {
    const { store, full, database } = await setup();
    const write = AutomationStudioProjectEventChunkStore.prototype.writeChunk;
    const injected = vi.spyOn(AutomationStudioProjectEventChunkStore.prototype, "writeChunk").mockImplementationOnce(async function (this: AutomationStudioProjectEventChunkStore, input) {
      const column = kind === "sha" ? "chunk_sha256" : kind === "end" ? "ended_at_ms" : kind === "generation" ? "generation" : kind === "proof" ? "complete_digest" : "first_sequence";
      const value = kind === "sha" || kind === "proof" ? "0".repeat(64) : kind === "end" ? 100 : kind === "generation" ? "stale" : 3;
      await database.run(`update recording_stream_reconciliations set ${column} = ? where recording_id = ?`, [value, full.recordingId]);
      return await write.call(this, input);
    });
    await expect(store.putRecording(full)).rejects.toThrow(/immutable/);
    injected.mockRestore();
    expect(await store.readRecordingTimeline(full.recordingId)).toEqual(full.timeline.slice(1));
    expect(await database.get("select count(*) as total from recording_stream_reconciliations")).toEqual({ total: 0 });
    expect(await store.getRecordingCompletion(full.recordingId)).toEqual({ ended_at_ms: 99, event_count: 2 });
    await store.putRecording(full);
    expect(await store.readRecordingTimeline(full.recordingId)).toEqual(full.timeline);
  });
  it("excludes a competing reconciliation while an exact claim is pending and consumes it once", async () => {
    const { store, full, database } = await setup();
    const write = AutomationStudioProjectEventChunkStore.prototype.writeChunk;
    const injected = vi.spyOn(AutomationStudioProjectEventChunkStore.prototype, "writeChunk").mockImplementationOnce(async function (this: AutomationStudioProjectEventChunkStore, input) {
      await expect(store.putRecording(full)).rejects.toThrow(/claim conflict/);
      await expect(store.appendRecordingEvents({ recordingId: full.recordingId, events: full.timeline.slice(0, 1) })).rejects.toThrow(/immutable/);
      return await write.call(this, input);
    });
    await store.putRecording(full);
    injected.mockRestore();
    expect(await database.get("select count(*) as total from recording_stream_reconciliations")).toEqual({ total: 0 });
    expect(await store.readRecordingTimeline(full.recordingId)).toEqual(full.timeline);
    await store.putRecording(full);
    expect(await database.get("select count(*) as total from recording_event_chunks")).toEqual({ total: 2 });
  });
  it("refuses takeover when process liveness is unknown and preserves the live exact claimant", async () => {
    const { store, full, database } = await setup();
    const write = AutomationStudioProjectEventChunkStore.prototype.writeChunk;
    const injected = vi.spyOn(AutomationStudioProjectEventChunkStore.prototype, "writeChunk").mockImplementationOnce(async function (this: AutomationStudioProjectEventChunkStore, input) {
      const before = await database.get("select * from recording_stream_reconciliations");
      const liveness = vi.spyOn(process, "kill").mockImplementation(() => { throw Object.assign(new Error("Unit liveness unavailable"), { code: "EPERM" }); });
      try { await expect(store.putRecording(full)).rejects.toThrow(/claim conflict/); }
      finally { liveness.mockRestore(); }
      expect(await database.get("select * from recording_stream_reconciliations")).toEqual(before);
      return await write.call(this, input);
    });
    await store.putRecording(full);
    injected.mockRestore();
    expect(await database.get("select count(*) as total from recording_stream_reconciliations")).toEqual({ total: 0 });
  });
});
