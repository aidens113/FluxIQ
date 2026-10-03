import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AutomationStudioService } from "../../../service.ts";

// `recordingEntryRemoval` through the service: the entries recorded from
// one gateway event leave the open recording, and stay gone after a reload.
describe("removing a recorded step through the service", () => {
  const roots: string[] = [];
  const services: AutomationStudioService[] = [];
  afterEach(async () => {
    // A service keeps an idle project database open for a moment; closing it releases the files.
    await Promise.all(services.splice(0).map((service) => service.close()));
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("removes the event's entries, persists the removal, and refuses nothing it did not find", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-entry-removal-"));
    roots.push(root);
    const service = new AutomationStudioService({ dataDir: root, seedFixture: false });
    services.push(service);
    const project = await service.createProject({ name: "Removal" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.removal", startedAt: 1, initialState: { timestamp: 1, namespaces: {} } });
    const step = (eventId: string) => ({ type: "observation", observationType: "input.action", payload: { step: eventId }, sourceId: "input.action", metadata: { policyEligible: false, eventId } }) as never;
    await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: step("web.1.100") });
    await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: step("web.2.200") });

    const removed = await service.recordingEntryRemoval.remove({ projectId: project.id, recordingId: recording.recordingId, eventId: "web.1.100" });
    expect(removed.removedCount).toBe(1);
    const eventIds = (session: { timeline: Array<{ metadata?: Record<string, unknown> }> }) => session.timeline.map((entry) => entry.metadata?.eventId).filter(Boolean);
    expect(eventIds(removed.recording)).toEqual(["web.2.200"]);

    expect((await service.recordingEntryRemoval.remove({ projectId: project.id, recordingId: recording.recordingId, eventId: "web.9.900" })).removedCount).toBe(0);

    const reloaded = new AutomationStudioService({ dataDir: root, seedFixture: false });
    services.push(reloaded);
    expect(eventIds(await reloaded.getRecordingSession(recording.recordingId, project.id))).toEqual(["web.2.200"]);
  });
});
