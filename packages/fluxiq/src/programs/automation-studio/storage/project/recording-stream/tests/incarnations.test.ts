// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createRecordingSession, appendRecordingEntry } from "../../../../model/index.ts";
import { AutomationStudioProjectAdministration } from "../../administration.ts";
import { AutomationStudioProjectDatabasePool, type AutomationStudioProjectDatabaseLease } from "../../database.ts";
import { AutomationStudioProjectEventChunkStore } from "../../event-chunk-store.ts";
import { AutomationStudioProjectRuntimeStreamStore } from "../../runtime-stream-store.ts";
import { AutomationStudioRecordingStreamStore, automationStudioRecordingEntry as codec } from "../index.ts";

describe("private recording incarnations preserve public slots", () => {
  const roots: string[] = [];
  const pools: AutomationStudioProjectDatabasePool[] = [];
  const stores: AutomationStudioProjectRuntimeStreamStore[] = [];
  afterEach(async () => {
    await Promise.all(stores.splice(0).map(store => store.close()));
    await Promise.all(pools.splice(0).map(pool => pool.closeAll()));
    await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
  });
  async function setup(unkeyed = false) {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-recording-incarnation-"));
    roots.push(root);
    const pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
    pools.push(pool);
    const admin = await AutomationStudioProjectAdministration.open({ pool, projectId: "project.unit" });
    await admin.close();
    const store = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: "project.unit" });
    stores.push(store);
    const base = createRecordingSession({ recordingId: "recording.unit", startedAt: 1, initialState: { timestamp: 1, namespaces: {} } });
    const old = appendRecordingEntry(base, { type: "marker", label: "unit old", timestamp: 2, ...(unkeyed ? {} : { metadata: { eventId: "event.old" }, correlationId: "packet.old" }) });
    const fresh = appendRecordingEntry(base, { type: "marker", label: "unit new", timestamp: 3, ...(unkeyed ? {} : { metadata: { eventId: "event.new" }, correlationId: "packet.new" }) });
    await store.putRecording(old);
    const database = (store as unknown as { lease: AutomationStudioProjectDatabaseLease }).lease.database;
    return { store, base, old, fresh, pool, database };
  }
  it("refuses supplied/omitted-time original retries and changed bodies of the removed captured packet", async () => {
    const { store, base, old, fresh } = await setup();
    await store.removeRecordingEntries(old, base);
    await expect(store.appendRecordingEvents({ recordingId: base.recordingId, events: old.timeline })).rejects.toThrow(/removal/);
    await expect(store.appendRecordingEvents({ recordingId: base.recordingId, events: [{ ...old.timeline[0]!, timestamp: 100, monotonicOffsetMs: 99 }], generatedFields: [{ id: "entry.0", timestamp: true, monotonicOffset: true }] })).rejects.toThrow(/removal/);
    await expect(store.appendRecordingEvents({ recordingId: base.recordingId, events: [{ ...old.timeline[0]!, label: "changed" }] })).rejects.toThrow(/removal/);
    await expect(store.appendRecordingEvents({ recordingId: base.recordingId, events: [{ ...old.timeline[0]!, metadata: { eventId: "event.changed" } }] })).rejects.toThrow(/removal/);
    await expect(store.appendRecordingEvents({ recordingId: base.recordingId, events: [{ ...old.timeline[0]!, correlationId: "packet.changed" }] })).rejects.toThrow(/removal/);
    await store.appendRecordingEvents({ recordingId: base.recordingId, events: fresh.timeline });
    expect(await store.readRecordingTimeline(base.recordingId)).toEqual(fresh.timeline);
    await expect(store.appendRecordingEvents({ recordingId: base.recordingId, events: old.timeline })).rejects.toThrow(/conflict/);
  });
  it("refuses an explicit-ID uncorrelated original with supplied or regenerated time while admitting distinct complete input", async () => {
    const { store, base, old, fresh } = await setup(true);
    await store.removeRecordingEntries(old, base);
    await expect(store.appendRecordingEvents({ recordingId: base.recordingId, events: old.timeline })).rejects.toThrow(/removal/);
    await expect(store.appendRecordingEvents({ recordingId: base.recordingId, events: [{ ...old.timeline[0]!, timestamp: 100, monotonicOffsetMs: 99 }], generatedFields: [{ id: "entry.0", timestamp: true, monotonicOffset: true }] })).rejects.toThrow(/removal/);
    await store.appendRecordingEvents({ recordingId: base.recordingId, events: fresh.timeline });
    expect(await store.readRecordingTimeline(base.recordingId)).toEqual(fresh.timeline);
  });
  it.each(["v1", "v2"])("chronologically binds %s controls to the old incarnation and ignores stale legacy file overlap", async version => {
    const { store, base, old, fresh, pool } = await setup();
    const chunks = await AutomationStudioProjectEventChunkStore.open({ pool, projectId: "project.unit" });
    try {
      if (version === "v1") await chunks.writeChunk({ streamKind: "recording", streamId: base.recordingId, events: [codec.removal(["entry.0"], 2)] });
      else await store.removeRecordingEntries(old, base);
      await store.appendRecordingEvents({ recordingId: base.recordingId, events: fresh.timeline });
      const stream = new AutomationStudioRecordingStreamStore(chunks, (store as unknown as { lease: AutomationStudioProjectDatabaseLease }).lease);
      expect(await stream.readTimeline(base.recordingId, old.timeline)).toEqual(fresh.timeline);
      expect((await store.listRecordingEvents({ recordingId: base.recordingId })).events).toEqual(fresh.timeline);
    } finally { await chunks.close(); }
  });
  it("refuses a replayed old v2 control against a newer incarnation without deleting its indexed identity", async () => {
    const { store, base, old, fresh, pool, database } = await setup();
    await store.removeRecordingEntries(old, base);
    const chunks = await AutomationStudioProjectEventChunkStore.open({ pool, projectId: "project.unit" });
    try {
      const control = (await chunks.readEventsBySequence({ streamKind: "recording", streamId: base.recordingId })).events[1]!;
      await store.appendRecordingEvents({ recordingId: base.recordingId, events: fresh.timeline });
      await chunks.writeChunk({ streamKind: "recording", streamId: base.recordingId, events: [{ ...control, sequence: 4 }] });
      await expect(store.getRemovedRecordingEntryProofs(base.recordingId)).rejects.toThrow(/incarnation proof/);
      expect(await database.get("select body_digest from recording_stream_entries where entry_id = 'entry.0'")).toEqual({ body_digest: codec.digest(fresh.timeline[0]!) });
      expect((await store.listRecordingSummaries()).recordings[0]?.metadata?.eventCount).toBe(1);
    } finally { await chunks.close(); }
  });
});
