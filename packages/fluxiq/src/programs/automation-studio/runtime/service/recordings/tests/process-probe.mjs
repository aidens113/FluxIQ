import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [phase, root, dist, mode] = process.argv.slice(2);
const load = relative => import(pathToFileURL(path.join(dist, relative)).href);
const { FluxIQ } = await load("framework/index.js"); // Required first: program construction uses registered framework owners.
const { appendRecordingEntry, finalizeRecordingSession } = await load("programs/automation-studio/model/index.js");
const { AutomationStudioProjectRuntimeStreamStore, AutomationStudioProjectEventChunkStore } = await load("programs/automation-studio/storage/index.js");
const { ProgramJsonStore } = await load("programs/_shared/storage.js");
const fx = FluxIQ.create({ rootDir: root, loadEnv: false, envFiles: [], modelProvidersEnabled: false });
let service;
try {
  await fx.setup({ createGitkeep: false, createGuides: false });
  service = fx.programs.automationStudio;
  assert.equal(service.repositories.recordingSessions.constructor.name, "AutomationStudioMemoryRepository");
  const noPacket = mode.startsWith("no-packet-");
  const identical = mode.includes("identical");
  const undo = mode === "undo-sole" || mode === "undo-last" || noPacket;
  const entryCount = mode.endsWith("sole") ? 1 : mode.endsWith("last") ? 2 : 40;
  const entries = Array.from({ length: entryCount }, (_, i) => ({ id: `entry.${i}`, ...(noPacket ? { type: "domain_event", eventType: "unit.old", payload: { index: i } } : { type: "marker", label: `unit ${i}` }), timestamp: i + 2, metadata: { eventId: `unit.${i}` } }));
  let projectId;
  if (phase === "write") {
    const project = await service.createProject({ name: "Unit recording durability", domainId: "unit-recording" });
    projectId = project.id;
    const base = await service.createRecording({ projectId, recordingId: "recording.unit", startedAt: 1, initialState: { timestamp: 1, namespaces: {} } });
    if (mode === "legacy") {
      // Reproduce the historical split via actual owners, never hand-edit database/runtime files.
      const full = finalizeRecordingSession(entries.reduce((recording, entry) => appendRecordingEntry(recording, entry), base), 99);
      const typed = await AutomationStudioProjectRuntimeStreamStore.open({ pool: service.runtimeProjectDatabasePool, projectId });
      const chunks = await AutomationStudioProjectEventChunkStore.open({ pool: service.runtimeProjectDatabasePool, projectId });
      try {
        await typed.upsertRecordingSummary({ ...full, endedAt: undefined });
        for (const entry of full.timeline.slice(1)) await chunks.writeChunk({ streamKind: "recording", streamId: full.recordingId, events: [entry] });
        await typed.upsertRecordingSummary(full);
      } finally {
        await chunks.close();
        await typed.close();
      }
      await service.writeRecordingTimeline(projectId, full.recordingId, full.timeline.slice(0, 1));
      const file = path.join(service.recordingPaths.recordingSessionDirectory(projectId, full.recordingId), "recording.json");
      await new ProgramJsonStore(file, () => ({})).write({ recording: { ...full, timeline: [] } });
    } else {
      const entered = [];
      const original = service.locks.withRecordingMutationLock;
      service.locks.withRecordingMutationLock = function (project, recording, operation) {
        return original.call(this, project, recording, async () => { entered.push(entered.length);
          return await operation(); });
      };
      const queued = entries.map(entry => service.appendRecordingEvent({ projectId, recordingId: base.recordingId, entry }));
      if (mode !== "removed" && mode !== "late-finalize" && !undo) queued.push(service.finalizeRecording({ projectId, recordingId: base.recordingId, endedAt: 99 }));
      await Promise.all(queued);
      assert.equal(entered.length, mode === "removed" || mode === "late-finalize" || undo ? entryCount : entryCount + 1);
      if (undo) {
        assert.equal((await service.recordingEntryRemoval.remove({ projectId, recordingId: base.recordingId, eventId: `unit.${entryCount - 1}` })).removedCount, 1);
        const fresh = noPacket ? { type: "domain_event", eventType: identical ? "unit.old" : "unit.new", payload: { index: identical ? entryCount - 1 : "new" }, timestamp: 50 }
          : { type: "marker", label: "unit new", timestamp: 50, metadata: { eventId: "unit.new" } };
        const next = await service.appendRecordingEvent({ projectId, recordingId: base.recordingId, entry: fresh });
        assert.equal(next.timeline.at(-1).id, `entry.${entryCount - 1}`);
        assert.equal(next.timeline.at(-1).sequence, entryCount - 1);
        await service.finalizeRecording({ projectId, recordingId: base.recordingId, endedAt: 99 });
      }
      if (mode === "late-finalize") {
        const originalPersist = service.tryPersistRecordingSession;
        service.tryPersistRecordingSession = async function (...args) {
          await originalPersist.apply(this, args);
          throw new Error("Unit late finalization failure");
        };
        await assert.rejects(service.finalizeRecording({ projectId, recordingId: base.recordingId, endedAt: 99 }), /Unit late finalization failure/);
        service.tryPersistRecordingSession = originalPersist;
        assert.equal((await service.repositories.recordingSessions.get(base.recordingId)).endedAt, undefined);
      }
      if (mode === "removed") {
        assert.equal((await service.recordingEntryRemoval.remove({ projectId, recordingId: base.recordingId, eventId: "unit.7" })).removedCount, 1);
        await service.finalizeRecording({ projectId, recordingId: base.recordingId, endedAt: 99 });
      }
    }
    await writeFile(path.join(root, "unit-probe.json"), JSON.stringify({ projectId }));
  } else {
    ({ projectId } = JSON.parse(await readFile(path.join(root, "unit-probe.json"), "utf8")));
    const recording = await service.getRecordingSession("recording.unit", projectId);
    const expected = entries.map((_, i) => i).filter(i => mode !== "removed" || i !== 7);
    assert.deepEqual(recording.timeline.map(entry => entry.id), expected.map(i => `entry.${i}`));
    assert.deepEqual(recording.timeline.map(entry => entry.sequence), expected);
    if (undo) {
      if (noPacket) {
        assert.equal(recording.timeline.at(-1).metadata?.eventId, undefined);
        assert.equal(recording.timeline.at(-1).eventType, identical ? "unit.old" : "unit.new");
        assert.equal(recording.timeline.at(-1).payload.index, identical ? entryCount - 1 : "new");
      } else {
        assert.equal(recording.timeline.at(-1).metadata.eventId, "unit.new");
        assert.equal(recording.timeline.at(-1).label, "unit new");
      }
    }
    assert.equal(recording.endedAt, 99);
    assert.equal((await service.finalizeRecording({ projectId, recordingId: "recording.unit" })).endedAt, 99);
    assert.equal((await service.finalizeRecording({ projectId, recordingId: "recording.unit", endedAt: 100 })).endedAt, 99);
    await assert.rejects(service.appendRecordingEvent({ projectId, recordingId: "recording.unit", entry: { type: "marker", label: "late" } }), /immutable/);
    const typed = await AutomationStudioProjectRuntimeStreamStore.open({ pool: service.runtimeProjectDatabasePool, projectId });
    try {
      // Legacy backfill is explicit reconciliation, retaining existing chunks and identity.
      if (mode === "legacy") await typed.putRecording(recording);
      assert.deepEqual((await typed.readRecordingTimeline("recording.unit")).map(entry => entry.sequence), expected);
    } finally { await typed.close(); }
  }
  const pool = service.runtimeProjectDatabasePool;
  await service.close();
  assert.equal(pool.isClosing, true);
  assert.equal(pool.stats().openProjects, 0);
  service = undefined;
  process.stdout.write(JSON.stringify({ phase, mode, entries: mode === "removed" ? 39 : entryCount, providers: 0, closed: true }) + "\n");
} finally {
  await service?.close();
  await fx.close();
}
