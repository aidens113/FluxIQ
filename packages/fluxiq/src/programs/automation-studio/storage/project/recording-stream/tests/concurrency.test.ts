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

function gate() {
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  return { waiting, release };
}
describe("competing recording durable owners", () => {
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
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-recording-race-"));
    roots.push(root);
    const pool = new AutomationStudioProjectDatabasePool({ rootDir: root });
    pools.push(pool);
    const admin = await AutomationStudioProjectAdministration.open({ pool, projectId: "project.unit" });
    await admin.close();
    const first = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: "project.unit" });
    const second = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: "project.unit" });
    stores.push(first, second);
    const base = createRecordingSession({ recordingId: "recording.unit", startedAt: 1, initialState: { timestamp: 1, namespaces: {} } });
    const one = appendRecordingEntry(base, { id: "entry.a", type: "marker", label: "unit a", timestamp: 2 });
    const two = appendRecordingEntry(one, { id: "entry.b", type: "marker", label: "unit b", timestamp: 3 });
    await first.putRecording(base);
    return { first, second, base, one, two };
  }
  it("refuses an append paused at chunk persistence after another owner finalizes", async () => {
    const { first, second, base, one } = await setup();
    const entered = gate();
    const resumed = gate();
    const write = AutomationStudioProjectEventChunkStore.prototype.writeChunk;
    const paused = vi.spyOn(AutomationStudioProjectEventChunkStore.prototype, "writeChunk").mockImplementationOnce(async function (this: AutomationStudioProjectEventChunkStore, input) {
      entered.release();
      await resumed.waiting;
      return await write.call(this, input);
    });
    const outcome = first.appendRecordingEvents({ recordingId: base.recordingId, events: one.timeline }).then(() => null, error => error);
    await entered.waiting;
    await second.putRecording({ ...base, endedAt: 99 });
    resumed.release();
    expect(await outcome).toBeInstanceOf(Error);
    paused.mockRestore();
    expect(await first.readRecordingTimeline(base.recordingId)).toEqual([]);
    expect(await first.getRecordingCompletion(base.recordingId)).toEqual({ ended_at_ms: 99, event_count: 0 });
  });
  it("refuses a removal paused at chunk persistence after another owner finalizes", async () => {
    const { first, second, base, one } = await setup();
    await first.putRecording(one);
    const entered = gate();
    const resumed = gate();
    const write = AutomationStudioProjectEventChunkStore.prototype.writeChunk;
    const paused = vi.spyOn(AutomationStudioProjectEventChunkStore.prototype, "writeChunk").mockImplementationOnce(async function (this: AutomationStudioProjectEventChunkStore, input) {
      entered.release();
      await resumed.waiting;
      return await write.call(this, input);
    });
    const outcome = first.removeRecordingEntries(one, base).then(() => null, error => error);
    await entered.waiting;
    await second.putRecording({ ...one, endedAt: 99 });
    resumed.release();
    expect(await outcome).toBeInstanceOf(Error);
    paused.mockRestore();
    expect(await first.readRecordingTimeline(base.recordingId)).toEqual(one.timeline);
    expect(await first.getRecordingCompletion(base.recordingId)).toEqual({ ended_at_ms: 99, event_count: 1 });
  });
  it("refuses a stale completion proof when an append lands before its SQL publication", async () => {
    const { first, second, base, one } = await setup();
    const database = (first as unknown as { lease: AutomationStudioProjectDatabaseLease }).lease.database;
    const run = database.run.bind(database);
    const entered = gate();
    const resumed = gate();
    let held = false;
    const paused = vi.spyOn(database, "run").mockImplementation(async (statement, values) => {
      if (!held && statement.startsWith("insert into recordings") && values?.[6] === 99) {
        held = true;
        entered.release();
        await resumed.waiting;
      }
      return await run(statement, values);
    });
    const outcome = first.putRecording({ ...base, endedAt: 99 }).then(() => null, error => error);
    await entered.waiting;
    await second.appendRecordingEvents({ recordingId: base.recordingId, events: one.timeline });
    resumed.release();
    expect(await outcome).toBeInstanceOf(Error);
    paused.mockRestore();
    expect(await first.getRecordingCompletion(base.recordingId)).toBeNull();
    expect(await first.readRecordingTimeline(base.recordingId)).toEqual(one.timeline);
    await first.putRecording({ ...one, endedAt: 99 });
    expect(await first.getRecordingCompletion(base.recordingId)).toEqual({ ended_at_ms: 99, event_count: 1 });
  });
  it.each([false, true])("does not publish delayed old counters after a newer append/removal (removal=%s)", async removal => {
    const { first, second, base, one, two } = await setup();
    const database = (first as unknown as { lease: AutomationStudioProjectDatabaseLease }).lease.database;
    const run = database.run.bind(database);
    const entered = gate();
    const resumed = gate();
    let held = false;
    const paused = vi.spyOn(database, "run").mockImplementation(async (statement, values) => {
      if (!held && statement.startsWith("update recordings set event_count")) {
        held = true;
        entered.release();
        await resumed.waiting;
      }
      return await run(statement, values);
    });
    const earlier = first.appendRecordingEvents({ recordingId: base.recordingId, events: one.timeline });
    await entered.waiting;
    await second.appendRecordingEvents({ recordingId: base.recordingId, events: two.timeline.slice(1) });
    if (removal) await second.removeRecordingEntries(two, base);
    resumed.release();
    await earlier;
    paused.mockRestore();
    const expected = removal ? [] : two.timeline;
    expect(await first.readRecordingTimeline(base.recordingId)).toEqual(expected);
    expect((await first.listRecordingSummaries()).recordings[0]?.metadata?.eventCount).toBe(expected.length);
  });
  it("keeps one coherent cursor owner when two packets reach the same chunk boundary", async () => {
    const { first, second, base, one, two } = await setup();
    const entered = gate();
    const resumed = gate();
    const write = AutomationStudioProjectEventChunkStore.prototype.writeChunk;
    const paused = vi.spyOn(AutomationStudioProjectEventChunkStore.prototype, "writeChunk").mockImplementationOnce(async function (this: AutomationStudioProjectEventChunkStore, input) {
      entered.release();
      await resumed.waiting;
      return await write.call(this, input);
    });
    const earlier = first.appendRecordingEvents({ recordingId: base.recordingId, events: one.timeline }).then(() => true, () => false);
    await entered.waiting;
    await second.appendRecordingEvents({ recordingId: base.recordingId, events: two.timeline.slice(1) });
    resumed.release();
    expect(await earlier).toBe(false);
    paused.mockRestore();
    expect(await first.readRecordingTimeline(base.recordingId)).toEqual(two.timeline.slice(1));
    expect((await first.listRecordingSummaries()).recordings[0]?.metadata?.eventCount).toBe(1);
  });
});
