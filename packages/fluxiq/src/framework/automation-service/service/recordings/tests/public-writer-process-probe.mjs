import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [phase, root, dist, mode] = process.argv.slice(2);
const load = relative => import(pathToFileURL(path.join(dist, relative)).href);
const { FluxIQ } = await load("framework/index.js");
const { AutomationStudioProjectRuntimeStreamStore } = await load("programs/automation-studio/storage/index.js");
const fx = FluxIQ.create({ rootDir: root, loadEnv: false, envFiles: [], modelProvidersEnabled: false });
let typed;
try {
  await fx.setup({ createGitkeep: false, createGuides: false });
  const service = fx.programs.automationStudio;
  let projectId;
  let expected;
  if (phase === "write") {
    const project = await service.createProject({ name: "Unit public writer restart" });
    projectId = project.id;
    await service.createRecording({ description: "Shows the steps the automation repeats.", projectId, recordingId: "recording.unit", startedAt: 1, initialState: { timestamp: 1, namespaces: {} } });
    const state = { id: "state.unit", timestamp: 2, namespaces: {} };
    await service.appendRecordingEvent({ projectId, recordingId: "recording.unit", entry: { id: "entry.snapshot", type: "observation", observationType: "client.state_snapshot", timestamp: 2, metadata: { eventId: "event.snapshot" }, payload: { state } } });
    typed = await AutomationStudioProjectRuntimeStreamStore.open({ pool: service.runtimeProjectDatabasePool, projectId });
    const original = (await typed.readRecordingTimeline("recording.unit"))[0];
    let returned;
    if (mode === "rename") returned = await service.updateRecording({ projectId, recordingId: "recording.unit", name: "Unit renamed" });
    else if (mode === "note") returned = await service.appendRecordingNoteEntry({ projectId, recordingId: "recording.unit", text: "Unit note", linkedEntryIds: ["entry.snapshot"] });
    else {
      service.registerRecordingDomain({ domainId: "unit", label: "Unit", schemaVersion: "0.1", events: [{ eventType: "unit.changed", label: "Unit changed" }] });
      const result = await service.appendRecordingDomainEvent({ projectId, recordingId: "recording.unit", domainId: "unit", eventType: "unit.changed", eventId: "unit.event", timestamp: 3 });
      assert.equal(result.accepted, true);
      returned = result.recording;
    }
    assert.deepEqual(returned.timeline[0].payload.state, state);
    assert.deepEqual((await service.repositories.recordingSessions.get("recording.unit")).timeline[0], original);
    assert.deepEqual((await typed.readRecordingTimeline("recording.unit"))[0], original);
    assert.equal((await service.recordingEntryRemoval.remove({ projectId, recordingId: "recording.unit", eventId: "event.snapshot" })).removedCount, 1);
    expected = await service.finalizeRecording({ projectId, recordingId: "recording.unit", endedAt: 99 });
    assert.equal(expected.timeline.some(entry => entry.id === "entry.snapshot"), false);
    assert.equal(expected.timeline.length, mode === "rename" ? 0 : 1);
    await writeFile(path.join(root, "unit-public.json"), JSON.stringify({ projectId, expected }));
  } else {
    ({ projectId, expected } = JSON.parse(await readFile(path.join(root, "unit-public.json"), "utf8")));
    const actual = await service.getRecordingSession("recording.unit", projectId);
    assert.deepEqual(actual.timeline, expected.timeline);
    assert.deepEqual(actual.notes, expected.notes);
    assert.equal(actual.name, expected.name);
    assert.equal(actual.endedAt, 99);
    assert.equal((await service.finalizeRecording({ projectId, recordingId: "recording.unit", endedAt: 100 })).endedAt, 99);
    await assert.rejects(service.appendRecordingEvent({ projectId, recordingId: "recording.unit", entry: { type: "marker", label: "late" } }), /immutable/);
    typed = await AutomationStudioProjectRuntimeStreamStore.open({ pool: service.runtimeProjectDatabasePool, projectId });
  }
  assert.deepEqual(await typed.readRecordingTimeline("recording.unit"), expected.timeline);
  assert.deepEqual(await typed.getRecordingCompletion("recording.unit"), { ended_at_ms: 99, event_count: expected.timeline.length });
  await typed.close();
  typed = undefined;
  await service.close();
  assert.equal(service.runtimeProjectDatabasePool.stats().openProjects, 0);
  process.stdout.write(JSON.stringify({ phase, mode, entries: expected.timeline.length, providers: 0, closed: true }) + "\n");
} finally {
  await typed?.close();
  await fx.close();
}
