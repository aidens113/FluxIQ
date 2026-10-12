import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
const [phase, root, dist] = process.argv.slice(2);
const load = relative => import(pathToFileURL(path.join(dist, relative)).href);
const { FluxIQ } = await load("framework/index.js");
const { appendRecordingEntry } = await load("programs/automation-studio/model/index.js");
const { AutomationStudioProjectRuntimeStreamStore, AutomationStudioProjectEventChunkStore } = await load("programs/automation-studio/storage/index.js");
const fx = FluxIQ.create({ rootDir: root, loadEnv: false, envFiles: [], modelProvidersEnabled: false });
let typed;
let chunks;
try {
  await fx.setup({ createGitkeep: false, createGuides: false });
  const service = fx.programs.automationStudio;
  let projectId;
  let full;
  let original;
  if (phase === "claim") {
    const project = await service.createProject({ name: "Unit claim restart" });
    projectId = project.id;
    const base = await service.createRecording({ projectId, recordingId: "recording.unit", startedAt: 1, initialState: { timestamp: 1, namespaces: {} } });
    full = { ...[0, 1].reduce((recording, i) => appendRecordingEntry(recording, { id: `entry.${i}`, type: "marker", label: `unit ${i}`, timestamp: i + 2 }), base), endedAt: 99 };
    typed = await AutomationStudioProjectRuntimeStreamStore.open({ pool: service.runtimeProjectDatabasePool, projectId });
    chunks = await AutomationStudioProjectEventChunkStore.open({ pool: service.runtimeProjectDatabasePool, projectId });
    await chunks.writeChunk({ streamKind: "recording", streamId: full.recordingId, events: full.timeline.slice(1) });
    original = await typed.lease.database.get("select * from recording_event_chunks where recording_id = ? and first_sequence = 1", [full.recordingId]);
    await typed.upsertRecordingSummary(full);
    await writeFile(path.join(root, "unit-claim.json"), JSON.stringify({ projectId, full, original }));
    const write = AutomationStudioProjectEventChunkStore.prototype.writeChunk;
    AutomationStudioProjectEventChunkStore.prototype.writeChunk = async function (input) {
      assert.equal(input.events[0].sequence, 2);
      assert.deepEqual(await typed.lease.database.get("select count(*) as total from recording_stream_reconciliations"), { total: 1 });
      process.send({ type: "claim-ready" });
      await new Promise(() => {
        setInterval(() => {}, 1_000);
      });
      return await write.call(this, input);
    };
    await typed.putRecording(full);
    throw new Error("Unit writer was expected to be terminated at its committed claim.");
  }
  ({ projectId, full, original } = JSON.parse(await readFile(path.join(root, "unit-claim.json"), "utf8")));
  typed = await AutomationStudioProjectRuntimeStreamStore.open({ pool: service.runtimeProjectDatabasePool, projectId });
  chunks = await AutomationStudioProjectEventChunkStore.open({ pool: service.runtimeProjectDatabasePool, projectId });
  assert.deepEqual(await typed.lease.database.get("select count(*) as total from recording_stream_reconciliations"), { total: 1 });
  if (phase === "live") {
    await assert.rejects(typed.putRecording(full), /claim conflict/);
    assert.deepEqual(await typed.lease.database.get("select count(*) as total from recording_stream_reconciliations"), { total: 1 });
    assert.equal((await typed.readRecordingTimeline(full.recordingId)).length, 1);
  } else {
    const conflicting = { ...full, timeline: full.timeline.map((entry, index) => index === 0 ? { ...entry, label: "unit conflicting" } : entry) };
    await assert.rejects(typed.putRecording(conflicting), /claim conflict/);
    assert.deepEqual(await typed.lease.database.get("select count(*) as total from recording_stream_reconciliations"), { total: 1 });
    const head = await typed.lease.database.get("select generation from recording_stream_heads where recording_id = ?", [full.recordingId]);
    await typed.lease.database.run("update recording_stream_heads set generation = ? where recording_id = ?", ["unit-stale-generation", full.recordingId]);
    await assert.rejects(typed.putRecording(full), /claim conflict/);
    assert.deepEqual(await typed.lease.database.get("select count(*) as total from recording_stream_reconciliations"), { total: 1 });
    await typed.lease.database.run("update recording_stream_heads set generation = ? where recording_id = ?", [head.generation, full.recordingId]);
    const orphan = await typed.lease.database.get("select owner_pid from recording_stream_reconciliations");
    await typed.lease.database.run("update recording_stream_reconciliations set owner_pid = ?", [process.pid]);
    await assert.rejects(typed.putRecording(full), /claim conflict/);
    assert.deepEqual(await typed.lease.database.get("select owner_pid from recording_stream_reconciliations"), { owner_pid: process.pid });
    await typed.lease.database.run("update recording_stream_reconciliations set owner_pid = ?", [orphan.owner_pid]);
    await typed.putRecording(full);
    assert.deepEqual(await typed.readRecordingTimeline(full.recordingId), full.timeline);
    assert.deepEqual(await typed.getRecordingCompletion(full.recordingId), { ended_at_ms: 99, event_count: 2 });
    assert.deepEqual(await typed.lease.database.get("select * from recording_event_chunks where recording_id = ? and first_sequence = 1", [full.recordingId]), original);
    assert.deepEqual(await typed.lease.database.get("select count(*) as total from recording_stream_reconciliations"), { total: 0 });
    await assert.rejects(typed.appendRecordingEvents({ recordingId: full.recordingId, events: [] }), /immutable/);
    }
  await chunks.close();
  chunks = undefined;
  await typed.close();
  typed = undefined;
  await service.close();
  assert.equal(service.runtimeProjectDatabasePool.stats().openProjects, 0);
  process.stdout.write(JSON.stringify({ phase, entries: phase === "live" ? 1 : 2, claims: phase === "live" ? 1 : 0, endedAt: 99, closed: true }) + "\n");
} finally {
  await chunks?.close();
  await typed?.close();
  await fx.close();
}
