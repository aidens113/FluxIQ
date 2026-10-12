import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRecordingSession, appendRecordingEntry } from "../../../../model/index.ts";
import { AutomationStudioProjectAdministration } from "../../administration.ts";
import { AutomationStudioProjectDatabasePool, type AutomationStudioProjectDatabaseLease } from "../../database.ts";
import { AutomationStudioProjectEventChunkStore } from "../../event-chunk-store.ts";
import { AutomationStudioProjectRuntimeStreamStore } from "../../runtime-stream-store.ts";
import { AutomationStudioProjectContentStore } from "../../content-store.ts";
import { AutomationStudioProjectObjectRepository } from "../../object-repository.ts";
import { automationStudioRecordingEntry as entryCodec } from "../index.ts";

describe("recording entry identity and storage cursor", () => {
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
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-recording-cursor-"));
    roots.push(root);
    const pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
    pools.push(pool);
    const admin = await AutomationStudioProjectAdministration.open({ pool, projectId: "project.unit" });
    await admin.close();
    const store = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: "project.unit" });
    stores.push(store);
    let recording = createRecordingSession({ recordingId: "recording.unit", startedAt: 1, initialState: { timestamp: 1, namespaces: {} } });
    for (let i = 0; i < 40; i++) recording = appendRecordingEntry(recording, { id: `entry.${i}`, type: "marker", label: `unit ${i}`, timestamp: i + 2 });
    return { pool, store, recording };
  }
  it("accepts first zero-based entry and keeps cursors positive", async () => {
    const { store, recording } = await setup();
    await store.upsertRecordingSummary({ ...recording, timeline: [] });
    expect(await store.appendRecordingEvents({ recordingId: recording.recordingId, events: recording.timeline.slice(0, 1) })).toMatchObject({ lastSequence: 1 });
    const page = await store.listRecordingEvents({ recordingId: recording.recordingId });
    expect(page.events).toEqual(recording.timeline.slice(0, 1));
    expect(page.lastSequence).toBe(1);
    await expect(store.appendRecordingEvents({ recordingId: recording.recordingId, events: recording.timeline.slice(0, 1) })).resolves.toMatchObject({ lastSequence: 1 });
    await expect(store.appendRecordingEvents({ recordingId: recording.recordingId, events: [{ ...recording.timeline[0]!, label: "conflict" }] })).rejects.toThrow(/conflict/i);
    expect((await store.listRecordingEvents({ recordingId: recording.recordingId })).events).toHaveLength(1);
    expect((await store.listRecordingSummaries()).recordings[0]?.metadata?.eventCount).toBe(1);
  });
  it("backs up a partial legacy SQL history without overwriting its entries", async () => {
    const { pool, store, recording } = await setup();
    await store.upsertRecordingSummary({ ...recording, timeline: [] });
    const chunks = await AutomationStudioProjectEventChunkStore.open({ pool, projectId: "project.unit" });
    try { await chunks.writeChunk({ streamKind: "recording", streamId: recording.recordingId, events: recording.timeline.slice(1, 3) }); }
    finally { await chunks.close(); }
    await store.putRecording({ ...recording, timeline: recording.timeline.slice(0, 3), endedAt: 99 });
    const page = await store.listRecordingEvents({ recordingId: recording.recordingId });
    expect([...page.events].sort((a, b) => a.sequence - b.sequence)).toEqual(recording.timeline.slice(0, 3));
    await store.putRecording({ ...recording, timeline: recording.timeline.slice(0, 3), endedAt: 99 });
    expect((await store.listRecordingEvents({ recordingId: recording.recordingId })).events).toHaveLength(3);
    await expect(store.putRecording({ ...recording, timeline: [{ ...recording.timeline[1]!, type: "marker", label: "conflict" }] })).rejects.toThrow(/conflict|missing/i);
  });
  it("reports further chunks beyond the chunk-reader window", async () => {
    const { store, recording } = await setup();
    await store.upsertRecordingSummary({ ...recording, timeline: [] });
    for (const entry of recording.timeline) await store.appendRecordingEvents({ recordingId: recording.recordingId, events: [entry] });
    const first = await store.listRecordingEvents({ recordingId: recording.recordingId, limit: 500 });
    expect(first.hasMore).toBe(true);
    const second = await store.listRecordingEvents({ recordingId: recording.recordingId, afterSequence: first.lastSequence, limit: 500 });
    expect([...first.events, ...second.events]).toEqual(recording.timeline);
  });
  it("folds explicit removals after legacy merge without exposing controls", async () => {
    const { store, recording } = await setup();
    const previous = { ...recording, timeline: recording.timeline.slice(0, 3) };
    const next = { ...previous, timeline: previous.timeline.slice(1) };
    await store.putRecording(previous);
    await store.removeRecordingEntries(previous, next);
    expect(await store.readRecordingTimeline(recording.recordingId, previous.timeline)).toEqual(next.timeline);
    expect((await store.listRecordingEvents({ recordingId: recording.recordingId })).events).toEqual(next.timeline);
    await expect(store.removeRecordingEntries(previous, next)).rejects.toThrow(/stale/i);
    await expect(store.putRecording(previous)).rejects.toThrow(/removal/);
    await expect(store.removeRecordingEntries(next, next)).rejects.toThrow(/requires/);
    await expect(store.removeRecordingEntries(next, { ...next, timeline: [{ ...next.timeline[0]!, type: "marker", label: "conflict" }] })).rejects.toThrow(/conflict/);
    await store.putRecording({ ...next, endedAt: 99 });
    await store.putRecording({ ...next, endedAt: 99 });
    await expect(store.appendRecordingEvents({ recordingId: next.recordingId, events: [] })).rejects.toThrow(/immutable/);
    await expect(store.removeRecordingEntries(next, { ...next, timeline: [] })).rejects.toThrow(/immutable/);
    await expect(store.putRecording({ ...next, endedAt: 100 })).rejects.toThrow(/end time conflict/);
  });
  it("does not interpret public entry fields as removal controls", async () => {
    const { store, recording } = await setup();
    const spoof = { ...recording.timeline[0]!, schemaVersion: "automation-studio.recording-removal.v1", removedIds: ["entry.1"] };
    await store.putRecording({ ...recording, timeline: [spoof, recording.timeline[1]!] });
    expect(await store.readRecordingTimeline(recording.recordingId)).toEqual([spoof, recording.timeline[1]!]);
  });
  it("preserves legacy SQL-only sequences without inferring an offset", async () => {
    const { pool, store, recording } = await setup();
    const legacy = recording.timeline.slice(1, 3);
    await store.upsertRecordingSummary({ ...recording, timeline: legacy });
    const chunks = await AutomationStudioProjectEventChunkStore.open({ pool, projectId: "project.unit" });
    try { await chunks.writeChunk({ streamKind: "recording", streamId: recording.recordingId, events: legacy }); }
    finally { await chunks.close(); }
    expect(await store.readRecordingTimeline(recording.recordingId)).toEqual(legacy);
    await expect(store.putRecording({ ...recording, timeline: legacy.map(entry => ({ ...entry, sequence: entry.sequence - 1 })) })).rejects.toThrow(/conflict/);
  });
  it("reads reserved-looking fields on legacy entries and rejects an unproven control", async () => {
    const { pool, store, recording } = await setup();
    const legacy = { ...recording.timeline[1]!, schemaVersion: "automation-studio.recording-removal.v1", removedIds: ["entry.2"] };
    await store.upsertRecordingSummary({ ...recording, timeline: [] });
    const chunks = await AutomationStudioProjectEventChunkStore.open({ pool, projectId: "project.unit" });
    try {
      await chunks.writeChunk({ streamKind: "recording", streamId: recording.recordingId, events: [legacy, recording.timeline[2]!] });
      expect(await store.readRecordingTimeline(recording.recordingId)).toEqual([legacy, recording.timeline[2]!]);
      await chunks.writeChunk({ streamKind: "recording", streamId: recording.recordingId, events: [{ sequence: 3, schemaVersion: "automation-studio.recording-removal.v1", removedIds: ["entry.unknown"] }] });
      await expect(store.readRecordingTimeline(recording.recordingId)).rejects.toThrow(/unknown recording removal/);
    } finally { await chunks.close(); }
  });
  it("repairs counters when chunk persistence succeeded but summary update failed", async () => {
    const { store, recording } = await setup();
    await store.upsertRecordingSummary({ ...recording, timeline: [] });
    const database = (store as unknown as { lease: AutomationStudioProjectDatabaseLease }).lease.database;
    const original = database.run.bind(database);
    let failed = false;
    const summary = vi.spyOn(database, "run").mockImplementation(async (...args) => {
      if (!failed && args[0].startsWith("update recordings set event_count")) {
        failed = true;
        throw new Error("Unit summary write failed");
      }
      return await original(...args);
    });
    const input = { recordingId: recording.recordingId, events: recording.timeline.slice(0, 1) };
    await expect(store.appendRecordingEvents(input)).rejects.toThrow("Unit summary write failed");
    summary.mockRestore();
    expect(await store.readRecordingTimeline(recording.recordingId)).toEqual(input.events);
    expect((await store.listRecordingSummaries()).recordings[0]?.metadata?.eventCount).toBe(0);
    await store.appendRecordingEvents(input);
    expect((await store.listRecordingSummaries()).recordings[0]?.metadata?.eventCount).toBe(1);
  });
  it("reads only newly landed chunks while appending successive packets", async () => {
    const { store, recording } = await setup();
    await store.upsertRecordingSummary({ ...recording, timeline: [] });
    const reads = vi.spyOn(AutomationStudioProjectEventChunkStore.prototype, "readChunk");
    for (const entry of recording.timeline.slice(0, 8)) await store.appendRecordingEvents({ recordingId: recording.recordingId, events: [entry] });
    expect(reads.mock.calls.length).toBeLessThanOrEqual(8);
  });
  it("keeps its cursor across owner close/reopen and catches external chunks and controls", async () => {
    const { pool, store, recording } = await setup();
    await store.upsertRecordingSummary({ ...recording, timeline: [] });
    await store.appendRecordingEvents({ recordingId: recording.recordingId, events: recording.timeline.slice(0, 1) });
    await store.close();
    const reopened = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: "project.unit" });
    stores.push(reopened);
    const reads = vi.spyOn(AutomationStudioProjectEventChunkStore.prototype, "readChunk");
    await reopened.appendRecordingEvents({ recordingId: recording.recordingId, events: recording.timeline.slice(1, 2) });
    expect(reads.mock.calls).toHaveLength(1);
    const chunks = await AutomationStudioProjectEventChunkStore.open({ pool, projectId: "project.unit" });
    try {
      await chunks.writeChunk({ streamKind: "recording", streamId: recording.recordingId, events: [entryCodec.encode(recording.timeline[2]!, 3)] });
      await reopened.appendRecordingEvents({ recordingId: recording.recordingId, events: recording.timeline.slice(3, 4) });
      await chunks.writeChunk({ streamKind: "recording", streamId: recording.recordingId, events: [entryCodec.removal(["entry.1"], 5)] });
      await reopened.appendRecordingEvents({ recordingId: recording.recordingId, events: recording.timeline.slice(4, 5) });
      await expect(reopened.appendRecordingEvents({ recordingId: recording.recordingId, events: recording.timeline.slice(1, 2) })).rejects.toThrow(/removal/);
      expect((await reopened.listRecordingSummaries()).recordings[0]?.metadata?.eventCount).toBe(4);
      expect((await reopened.readRecordingTimeline(recording.recordingId)).map(entry => entry.id)).toEqual(["entry.0", "entry.2", "entry.3", "entry.4"]);
    } finally { await chunks.close(); }
  });
  it("invalidates a projected prefix when raw earlier chunks or descriptors change", async () => {
    const { pool, store, recording } = await setup();
    await store.upsertRecordingSummary({ ...recording, timeline: [] });
    const chunks = await AutomationStudioProjectEventChunkStore.open({ pool, projectId: "project.unit" });
    try {
      await chunks.writeChunk({ streamKind: "recording", streamId: recording.recordingId, events: [entryCodec.encode(recording.timeline[1]!, 2)] });
      await store.appendRecordingEvents({ recordingId: recording.recordingId, events: [] });
      const database = (store as unknown as { lease: AutomationStudioProjectDatabaseLease }).lease.database;
      const before = await database.get<{ generation: string }>("select generation from recording_stream_heads where recording_id = ?", [recording.recordingId]);
      await chunks.writeChunk({ streamKind: "recording", streamId: recording.recordingId, events: [entryCodec.encode(recording.timeline[0]!, 1)] });
      expect(await database.get("select generation from recording_stream_heads where recording_id = ?", [recording.recordingId])).toBeUndefined();
      await store.appendRecordingEvents({ recordingId: recording.recordingId, events: recording.timeline.slice(2, 3) });
      const after = await database.get<{ generation: string }>("select generation from recording_stream_heads where recording_id = ?", [recording.recordingId]);
      expect(after?.generation).not.toBe(before?.generation);
      await database.run("update recording_event_chunks set sha256 = sha256 where recording_id = ?", [recording.recordingId]);
      expect(await database.get("select generation from recording_stream_heads where recording_id = ?", [recording.recordingId])).toBeUndefined();
      await store.appendRecordingEvents({ recordingId: recording.recordingId, events: [] });
      expect((await store.listRecordingSummaries()).recordings[0]?.metadata?.eventCount).toBe(3);
      expect(await store.readRecordingTimeline(recording.recordingId)).toEqual(recording.timeline.slice(0, 3));
    } finally { await chunks.close(); }
  });
  it("refuses to publish a packet removed externally while its chunk was landing", async () => {
    const { store, recording } = await setup();
    await store.upsertRecordingSummary({ ...recording, timeline: [] });
    const original = AutomationStudioProjectEventChunkStore.prototype.writeChunk;
    let removed = false;
    vi.spyOn(AutomationStudioProjectEventChunkStore.prototype, "writeChunk").mockImplementation(async function(this: AutomationStudioProjectEventChunkStore, input) {
      const written = await original.call(this, input);
      if (!removed && input.streamKind === "recording") {
        removed = true;
        await original.call(this, { streamKind: "recording", streamId: recording.recordingId, events: [entryCodec.removal(["entry.0"], written.lastSequence + 1)] });
      }
      return written;
    });
    await expect(store.appendRecordingEvents({ recordingId: recording.recordingId, events: recording.timeline.slice(0, 1) })).rejects.toThrow(/removed|conflict/);
    expect(await store.readRecordingTimeline(recording.recordingId)).toEqual([]);
  });
  it("rolls back a failed projection commit and catches the landed chunk on retry", async () => {
    const { store, recording } = await setup();
    await store.upsertRecordingSummary({ ...recording, timeline: [] });
    const database = (store as unknown as { lease: AutomationStudioProjectDatabaseLease }).lease.database;
    const original = database.transaction.bind(database);
    let failed = false;
    const commit = vi.spyOn(database, "transaction").mockImplementation(operation => original(async sql => operation({ ...sql, run: async (...args) => {
      const result = await sql.run(...args);
      if (!failed && args[0].startsWith("update recording_stream_heads set indexed_cursor")) {
        failed = true;
        throw new Error("Unit projection commit failed");
      }
      return result;
    } })));
    const input = { recordingId: recording.recordingId, events: recording.timeline.slice(0, 1) };
    await expect(store.appendRecordingEvents(input)).rejects.toThrow("Unit projection commit failed");
    commit.mockRestore();
    expect(await store.readRecordingTimeline(recording.recordingId)).toEqual(input.events);
    expect(await database.get("select indexed_cursor, event_count from recording_stream_heads where recording_id = ?", [recording.recordingId])).toEqual({ indexed_cursor: 0, event_count: 0 });
    await store.appendRecordingEvents(input);
    expect((await store.listRecordingSummaries()).recordings[0]?.metadata?.eventCount).toBe(1);
  });
  it("clears derived identities on explicit delete and permits same-ID recording recreation", async () => {
    const { store, recording } = await setup();
    await store.upsertRecordingSummary({ ...recording, timeline: [] });
    await store.appendRecordingEvents({ recordingId: recording.recordingId, events: recording.timeline.slice(0, 1) });
    const database = (store as unknown as { lease: AutomationStudioProjectDatabaseLease }).lease.database;
    const before = await database.get<{ generation: string }>("select generation from recording_stream_heads where recording_id = ?", [recording.recordingId]);
    const objects = await AutomationStudioProjectObjectRepository.open({ pool: pools.at(-1)!, projectId: "project.unit" });
    const content = await AutomationStudioProjectContentStore.open({ pool: pools.at(-1)!, projectId: "project.unit" });
    try {
      const oldChunk = await database.get<{ object_id: string; sha256: string }>("select object_id, sha256 from recording_event_chunks where recording_id = ?", [recording.recordingId]);
      const bytes = (await content.readBytesBySha256(oldChunk!.sha256)).content;
      await objects.addReference({ referenceId: "reference.runtime", objectId: oldChunk!.object_id, ownerKind: "runtime_run", ownerId: "run.unrelated", purpose: "event_chunk" });
      await objects.addReference({ referenceId: "reference.other-recording", objectId: oldChunk!.object_id, ownerKind: "recording", ownerId: "recording.other", purpose: "event_chunk" });
      await objects.addReference({ referenceId: "reference.review", objectId: oldChunk!.object_id, ownerKind: "recording", ownerId: recording.recordingId, purpose: "review" });
      await content.putBytes({ content: Buffer.from("unit unrelated content"), mediaType: "text/plain", owner: { ownerKind: "recording", ownerId: recording.recordingId, purpose: "event_chunk", referenceId: "reference.unrelated" } });
      const contentBefore = await database.get("select count(*) as total from objects");
      await database.run("delete from recordings where recording_id = ?", [recording.recordingId]);
      expect(await database.get("select count(*) as total from recording_stream_entries")).toEqual({ total: 0 });
      expect(await database.get("select count(*) as total from recording_event_chunks")).toEqual({ total: 0 });
      expect(await database.get("select count(*) as total from objects")).toEqual(contentBefore);
      expect((await content.readBytesBySha256(oldChunk!.sha256)).content).toEqual(bytes);
      expect((await database.all<{ reference_id: string }>("select reference_id from object_references order by reference_id")).map(row => row.reference_id)).toEqual(["reference.other-recording", "reference.review", "reference.runtime", "reference.unrelated"]);
      await store.upsertRecordingSummary({ ...recording, timeline: [] });
      const entry = { ...recording.timeline[0]!, type: "marker" as const, label: "recreated" };
      await store.appendRecordingEvents({ recordingId: recording.recordingId, events: [entry] });
      const after = await database.get<{ generation: string }>("select generation from recording_stream_heads where recording_id = ?", [recording.recordingId]);
      expect(after?.generation).not.toBe(before?.generation);
      expect(await store.readRecordingTimeline(recording.recordingId)).toEqual([entry]);
      expect((await content.readBytesBySha256(oldChunk!.sha256)).content).toEqual(bytes);
    } finally {
      await content.close();
      await objects.close();
    }
  });
});
