// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { FluxIQ } from "../../../../../framework/index.ts";
import type { AutomationStudioObjectDocuments } from "../object-documents.ts";

it("restores the exact ref-only recording body from an equivalent hydrated state and refuses conflicting state", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-recording-public-state-"));
  const fx = FluxIQ.create({ rootDir: root, loadEnv: false, envFiles: [], modelProvidersEnabled: false });
  try {
    await fx.setup({ createGitkeep: false, createGuides: false });
    const service = fx.programs.automationStudio;
    const project = await service.createProject({ name: "Unit state normalization" });
    const recording = await service.createRecording({ description: "Shows the steps the automation repeats.", projectId: project.id, recordingId: "recording.unit", startedAt: 1, initialState: { timestamp: 1, namespaces: {} } });
    const stored = await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "observation", observationType: "client.state_snapshot", timestamp: 2, payload: { state: { id: "state.unit", timestamp: 2, namespaces: {} } } } });
    const hydrated = await service.getRecordingSession(recording.recordingId, project.id);
    const documents = (service as unknown as { objectDocuments: AutomationStudioObjectDocuments }).objectDocuments;
    expect((await documents.dehydrateRecordingStateSnapshotRefs(hydrated, project.id)).timeline).toEqual(stored.timeline);
    const entry = hydrated.timeline[0]!;
    if (entry.type !== "observation") throw new Error("Unit state observation missing.");
    const conflicting = { ...hydrated, timeline: [{ ...entry, payload: { ...entry.payload, state: { id: "state.conflicting", timestamp: 3, namespaces: {} } } }] };
    await expect(documents.dehydrateRecordingStateSnapshotRefs(conflicting, project.id)).rejects.toThrow(/conflicts with its durable ref/);
  } finally {
    await fx.close();
    await rm(root, { recursive: true, force: true });
  }
});
