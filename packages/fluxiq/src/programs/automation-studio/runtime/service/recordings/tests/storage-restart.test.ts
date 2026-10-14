import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FluxIQ } from "../../../../../../framework/index.ts";
import { AutomationStudioProjectEventChunkStore, AutomationStudioProjectRuntimeStreamStore, type AutomationStudioProjectDatabasePool, type CanonicalAutomationStudioRepositories } from "../../../../storage/index.ts";
import { appendRecordingEntry } from "../../../../model/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { loadRecordingTimeline } from "../load-timeline.ts";

describe("recording restart durability", () => {
  const roots: string[] = [];
  const services: AutomationStudioService[] = [];
  const frameworks: FluxIQ[] = [];
  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(services.splice(0).map(service => service.close()));
    await Promise.all(frameworks.splice(0).map(fx => fx.close()));
    await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
  });
  async function setup(objectStore = false) {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-recording-restart-"));
    roots.push(root);
    let service: AutomationStudioService;
    if (objectStore) {
      const fx = FluxIQ.create({ rootDir: root, loadEnv: false, envFiles: [], modelProvidersEnabled: false });
      frameworks.push(fx);
      await fx.setup({ createGitkeep: false, createGuides: false });
      service = fx.programs.automationStudio;
    } else service = new AutomationStudioService({ dataDir: root, seedFixture: false });
    services.push(service);
    const project = await service.createProject({ name: "Unit recording" });
    const recording = await service.createRecording({ description: "Shows the steps the automation repeats.", projectId: project.id, recordingId: "recording.unit", startedAt: 1, initialState: { timestamp: 1, namespaces: {} } });
    const pool = (service as unknown as { runtimeProjectDatabasePool: AutomationStudioProjectDatabasePool }).runtimeProjectDatabasePool;
    return { root, service, project, recording, pool };
  }
  it.each(["rename", "note", "domain"])("preserves snapshot storage and hydrated responses through public %s then removal", async writer => {
    const { service, project, recording, pool } = await setup(true);
    const state = { id: "state.unit", timestamp: 2, namespaces: {} };
    await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { id: "entry.snapshot", type: "observation", observationType: "client.state_snapshot", timestamp: 2, metadata: { eventId: "event.snapshot" }, payload: { state } } });
    const typed = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: project.id });
    try {
      const original = (await typed.readRecordingTimeline(recording.recordingId))[0]!;
      let returned;
      if (writer === "rename") returned = await service.updateRecording({ projectId: project.id, recordingId: recording.recordingId, name: "Unit renamed" });
      else if (writer === "note") returned = await service.appendRecordingNoteEntry({ projectId: project.id, recordingId: recording.recordingId, text: "Unit note", linkedEntryIds: ["entry.snapshot"] });
      else {
        service.registerRecordingDomain({ domainId: "unit", label: "Unit", schemaVersion: "0.1", events: [{ eventType: "unit.changed", label: "Unit changed" }] });
        const result = await service.appendRecordingDomainEvent({ projectId: project.id, recordingId: recording.recordingId, domainId: "unit", eventType: "unit.changed", timestamp: 3 });
        expect(result.accepted).toBe(true);
        returned = result.recording;
      }
      expect(returned.timeline[0]).toMatchObject({ payload: { state } });
      const raw = await (service as unknown as { repositories: CanonicalAutomationStudioRepositories }).repositories.recordingSessions.get(recording.recordingId);
      expect(raw?.timeline[0]).toEqual(original);
      expect((await typed.readRecordingTimeline(recording.recordingId))[0]).toEqual(original);
      expect((await service.recordingEntryRemoval.remove({ projectId: project.id, recordingId: recording.recordingId, eventId: "event.snapshot" })).removedCount).toBe(1);
      expect((await service.getRecordingSession(recording.recordingId, project.id)).timeline.some(entry => entry.id === "entry.snapshot")).toBe(false);
      expect((await typed.readRecordingTimeline(recording.recordingId)).some(entry => entry.id === "entry.snapshot")).toBe(false);
    } finally { await typed.close(); }
  });
  it.each(["rename", "note", "domain"])("does not advance the canonical mirror when public %s persistence fails", async writer => {
    const { service, project, recording } = await setup(true);
    const state = { id: "state.unit", timestamp: 2, namespaces: {} };
    await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { id: "entry.snapshot", type: "observation", observationType: "client.state_snapshot", timestamp: 2, payload: { state } } });
    const repositories = (service as unknown as { repositories: CanonicalAutomationStudioRepositories }).repositories;
    const before = await repositories.recordingSessions.get(recording.recordingId);
    const failure = vi.spyOn(AutomationStudioProjectRuntimeStreamStore.prototype, "putRecording").mockRejectedValueOnce(new Error("Unit public persist failed"));
    let result;
    if (writer === "rename") result = service.updateRecording({ projectId: project.id, recordingId: recording.recordingId, name: "Unit renamed" });
    else if (writer === "note") result = service.appendRecordingNoteEntry({ projectId: project.id, recordingId: recording.recordingId, text: "Unit note" });
    else {
      service.registerRecordingDomain({ domainId: "unit", label: "Unit", schemaVersion: "0.1", events: [{ eventType: "unit.changed", label: "Unit changed" }] });
      result = service.appendRecordingDomainEvent({ projectId: project.id, recordingId: recording.recordingId, domainId: "unit", eventType: "unit.changed", timestamp: 3 });
    }
    await expect(result).rejects.toThrow("Unit public persist failed");
    failure.mockRestore();
    expect(await repositories.recordingSessions.get(recording.recordingId)).toEqual(before);
  });
  it("rejects supplied inline state that conflicts with an existing durable snapshot ref", async () => {
    const { service, project, recording } = await setup(true);
    const original = await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { id: "entry.original", type: "observation", observationType: "client.state_snapshot", timestamp: 2, payload: { state: { id: "state.original", timestamp: 2, namespaces: {} } } } });
    const entry = original.timeline[0]!;
    const stateRef = entry.type === "observation" ? entry.payload?.stateRef : undefined;
    if (typeof stateRef !== "string") throw new Error("Unit snapshot ref was not prepared.");
    await expect(service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { id: "entry.conflicting", type: "observation", observationType: "client.state_snapshot", timestamp: 3, payload: { stateRef, state: { id: "state.conflict", timestamp: 3, namespaces: {} } } } })).rejects.toThrow(/conflicts with its durable ref/);
    expect((await service.getRecordingSession(recording.recordingId, project.id)).timeline).toHaveLength(1);
  });
  it("rejects typed append failure without silently writing fallback or advancing the mirror", async () => {
    const { service, project, recording } = await setup();
    const failure = vi.spyOn(AutomationStudioProjectRuntimeStreamStore.prototype, "appendRecordingEvents").mockRejectedValueOnce(new Error("Unit typed write failed"));
    await expect(service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { id: "entry.unit", type: "marker", label: "unit" } })).rejects.toThrow("Unit typed write failed");
    failure.mockRestore();
    expect((await service.getRecordingSession(recording.recordingId, project.id)).timeline).toEqual([]);
    const appended = await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { id: "entry.unit", type: "marker", label: "unit" } });
    expect(appended.timeline.map(entry => entry.sequence)).toEqual([0]);
  });
  it("keeps failed finalization open and permits the successful retry", async () => {
    const { service, project, recording } = await setup();
    const failure = vi.spyOn(AutomationStudioProjectRuntimeStreamStore.prototype, "putRecording").mockRejectedValueOnce(new Error("Unit final write failed"));
    await expect(service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId, endedAt: 99 })).rejects.toThrow("Unit final write failed");
    failure.mockRestore();
    expect((await service.getRecordingSession(recording.recordingId, project.id)).endedAt).toBeUndefined();
    expect((await service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId, endedAt: 99 })).endedAt).toBe(99);
  });
  it("recovers proven durable completion after later metadata fails, including restart and default-time retry", async () => {
    const { root, service, project, recording } = await setup(true);
    await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { id: "entry.unit", type: "marker", label: "unit", timestamp: 2 } });
    const owner = service as unknown as { tryPersistRecordingSession: (projectId: string, value: typeof recording) => Promise<boolean>; repositories: CanonicalAutomationStudioRepositories };
    const original = owner.tryPersistRecordingSession.bind(service);
    const failure = vi.spyOn(owner, "tryPersistRecordingSession").mockImplementationOnce(async (...args) => {
      await original(...args);
      throw new Error("Unit late finalization failure");
    });
    await expect(service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId, endedAt: 99 })).rejects.toThrow("Unit late finalization failure");
    failure.mockRestore();
    expect((await owner.repositories.recordingSessions.get(recording.recordingId))?.endedAt).toBeUndefined();
    const incomplete = vi.spyOn(AutomationStudioProjectRuntimeStreamStore.prototype, "getRecordingCompletion").mockResolvedValueOnce({ ended_at_ms: 99, event_count: 2 });
    await expect(service.getRecordingSession(recording.recordingId, project.id)).rejects.toThrow("timeline count mismatch");
    incomplete.mockRestore();
    expect((await owner.repositories.recordingSessions.get(recording.recordingId))?.endedAt).toBeUndefined();
    expect((await service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId })).endedAt).toBe(99);
    await service.close();
    const fx = FluxIQ.create({ rootDir: root, loadEnv: false, envFiles: [], modelProvidersEnabled: false });
    frameworks.push(fx);
    await fx.setup({ createGitkeep: false, createGuides: false });
    const reopened = fx.programs.automationStudio;
    const recovered = await reopened.getRecordingSession(recording.recordingId, project.id);
    expect(recovered.endedAt).toBe(99);
    expect(recovered.timeline.map(entry => [entry.id, entry.sequence])).toEqual([["entry.unit", 0]]);
    expect((await reopened.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId, endedAt: 100 })).endedAt).toBe(99);
    await expect(reopened.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "marker", label: "late" } })).rejects.toThrow(/immutable/);
  });
  it("accepts an identical landed append after a later metadata write failed", async () => {
    const { service, project, recording } = await setup();
    const metadata = service as unknown as { writeRecordingStateIndex: () => Promise<void> };
    const failure = vi.spyOn(metadata, "writeRecordingStateIndex").mockRejectedValueOnce(new Error("Unit metadata write failed"));
    const input = { projectId: project.id, recordingId: recording.recordingId, entry: { id: "entry.unit", type: "marker" as const, label: "unit", timestamp: 2 } };
    await expect(service.appendRecordingEvent(input)).rejects.toThrow("Unit metadata write failed");
    failure.mockRestore();
    expect((await service.getRecordingSession(recording.recordingId, project.id)).timeline).toEqual([]);
    const retry = await service.appendRecordingEvent(input);
    expect(retry.timeline.map(entry => [entry.id, entry.sequence])).toEqual([["entry.unit", 0]]);
    await service.appendRecordingEvent({ ...input, entry: { id: "entry.next", type: "marker", label: "next", timestamp: 3 } });
    await service.close();
    const reopened = new AutomationStudioService({ dataDir: roots[0]!, seedFixture: false });
    services.push(reopened);
    expect((await reopened.getRecordingSession(recording.recordingId, project.id)).timeline.map(entry => [entry.id, entry.sequence])).toEqual([["entry.unit", 0], ["entry.next", 1]]);
  });
  it("preserves landed generated time and offset when the identical packet is retried", async () => {
    const { service, project, recording } = await setup(true);
    const clock = vi.spyOn(Date, "now").mockReturnValue(100);
    const metadata = service as unknown as { writeRecordingStateIndex: () => Promise<void> };
    const failure = vi.spyOn(metadata, "writeRecordingStateIndex").mockRejectedValueOnce(new Error("Unit metadata write failed"));
    const input = { projectId: project.id, recordingId: recording.recordingId, entry: { type: "marker" as const, label: "unit", correlationId: "packet.unit" } };
    await expect(service.appendRecordingEvent(input)).rejects.toThrow("Unit metadata write failed");
    failure.mockRestore();
    clock.mockReturnValue(200);
    await expect(service.appendRecordingEvent({ ...input, entry: { ...input.entry, label: "conflict" } })).rejects.toThrow(/conflict/);
    const retry = await service.appendRecordingEvent(input);
    expect(retry.timeline).toHaveLength(1);
    expect(retry.timeline[0]).toMatchObject({ id: "entry.0", sequence: 0, timestamp: 100, monotonicOffsetMs: 99 });
    expect((await service.getRecordingSession(recording.recordingId, project.id)).timeline).toEqual(retry.timeline);
    clock.mockRestore();
  });
  it("keeps prior inline snapshot bodies in the append return while storage dehydrates them", async () => {
    const { service, project, recording } = await setup(true);
    const state = { id: "state.legacy", timestamp: 2, namespaces: {} };
    const legacy = appendRecordingEntry(recording, { id: "entry.legacy", type: "observation", observationType: "client.state_snapshot", timestamp: 2, correlationId: "packet.legacy", payload: { state } });
    const repositories = (service as unknown as { repositories: CanonicalAutomationStudioRepositories }).repositories;
    await repositories.recordingSessions.put(legacy);
    const appended = await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { id: "entry.new", type: "marker", label: "unit", timestamp: 3 } });
    expect(appended.timeline[0]).toEqual(legacy.timeline[0]);
    const stored = await repositories.recordingSessions.get(recording.recordingId);
    expect(stored?.timeline[0]?.type === "observation" && stored.timeline[0].payload?.stateRef).toMatch(/^automation-object:/);
    const hydrated = await service.getRecordingSession(recording.recordingId, project.id);
    expect(hydrated.timeline[0]?.type === "observation" && hydrated.timeline[0].payload?.state).toEqual(state);
  });
  it("retains prepared snapshot refs on an omitted-time retry and hydrates on public read", async () => {
    const { service, project, recording } = await setup(true);
    const state = { id: "state.retry", timestamp: 2, namespaces: {} };
    const clock = vi.spyOn(Date, "now").mockReturnValue(100);
    const failure = vi.spyOn(service as unknown as { writeRecordingStateIndex: () => Promise<void> }, "writeRecordingStateIndex").mockRejectedValueOnce(new Error("Unit metadata failure"));
    const input = { projectId: project.id, recordingId: recording.recordingId, entry: { type: "observation" as const, observationType: "client.state_snapshot", correlationId: "packet.retry", payload: { state } } };
    await expect(service.appendRecordingEvent(input)).rejects.toThrow("Unit metadata failure");
    failure.mockRestore();
    clock.mockReturnValue(200);
    const retried = await service.appendRecordingEvent(input);
    expect(retried.timeline).toHaveLength(1);
    expect(retried.timeline[0]).toMatchObject({ sequence: 0, timestamp: 100, monotonicOffsetMs: 99, payload: { stateRef: expect.stringMatching(/^automation-object:/) } });
    expect(retried.timeline[0]?.type === "observation" && retried.timeline[0].payload?.state).toBeUndefined();
    const hydrated = await service.getRecordingSession(recording.recordingId, project.id);
    expect(hydrated.timeline[0]?.type === "observation" && hydrated.timeline[0].payload?.state).toEqual(state);
    expect(hydrated.timeline[0]?.timestamp).toBe(100);
    clock.mockRestore();
  });
  it("merges legacy file and SQL overlap once, preserving identity and refusing conflict", async () => {
    const { service, project, recording, pool } = await setup();
    const appended = await service.appendRecordingEvents({ projectId: project.id, recordingId: recording.recordingId, entries: [0, 1, 2].map(i => ({ id: `entry.${i}`, type: "marker" as const, label: `unit ${i}`, timestamp: i + 2 })) });
    const file = path.join(roots[0]!, "legacy.jsonl");
    await writeFile(file, appended.timeline.slice(0, 2).map(entry => JSON.stringify(entry)).join("\n"));
    expect(await loadRecordingTimeline(file, project.id, recording.recordingId, pool)).toEqual(appended.timeline);
    await writeFile(file, JSON.stringify({ ...appended.timeline[0], label: "conflict" }));
    await expect(loadRecordingTimeline(file, project.id, recording.recordingId, pool)).rejects.toThrow(/conflict/);
    const chunks = await AutomationStudioProjectEventChunkStore.open({ pool: pool, projectId: project.id });
    try { expect((await chunks.readEventsBySequence({ streamKind: "recording", streamId: recording.recordingId })).events).toHaveLength(3); }
    finally { await chunks.close(); }
  });
  it("does not republish an externally removed cached prefix when appending", async () => {
    const { service, project, recording, pool } = await setup(true);
    const previous = await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { id: "entry.a", type: "marker", label: "unit a", timestamp: 2 } });
    const typed = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: project.id });
    try {
      await typed.removeRecordingEntries(previous, { ...previous, timeline: [] });
      const next = await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { id: "entry.b", type: "marker", label: "unit b", timestamp: 3 } });
      expect(next.timeline.map(entry => entry.id)).toEqual(["entry.b"]);
      expect((await service.getRecordingSession(recording.recordingId, project.id)).timeline).toEqual(next.timeline);
      expect(await typed.readRecordingTimeline(recording.recordingId)).toEqual(next.timeline);
      expect((await typed.listRecordingSummaries()).recordings[0]?.metadata?.eventCount).toBe(1);
    } finally { await typed.close(); }
  });
  it.each([false, true])("successfully appends past a retained prefix without republishing a removed entry (external=%s)", async external => {
    const { service, project, recording, pool } = await setup(true);
    const previous = await service.appendRecordingEvents({ projectId: project.id, recordingId: recording.recordingId, entries: ["a", "b"].map((id, i) => ({ id: `entry.${id}`, type: "marker" as const, label: `unit ${id}`, timestamp: i + 2, metadata: { eventId: `event.${id}` } })) });
    const typed = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: project.id });
    try {
      if (external) await typed.removeRecordingEntries(previous, { ...previous, timeline: previous.timeline.slice(1) });
      else await service.recordingEntryRemoval.remove({ projectId: project.id, recordingId: recording.recordingId, eventId: "event.a" });
      const next = await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { id: "entry.c", type: "marker", label: "unit c", timestamp: 4 } });
      expect(next.timeline.map(entry => [entry.id, entry.sequence])).toEqual([["entry.b", 1], ["entry.c", 2]]);
      expect(await typed.readRecordingTimeline(recording.recordingId)).toEqual(next.timeline);
      expect((await typed.listRecordingSummaries()).recordings[0]?.metadata?.eventCount).toBe(2);
    } finally { await typed.close(); }
  });
  it.each([1, 2])("preserves normal undo last entry then append identity/sequence reuse (%s entries)", async count => {
    const { service, project, recording, pool } = await setup(true);
    for (let i = 0; i < count; i++) await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "marker", label: `unit ${i}`, timestamp: i + 2, metadata: { eventId: `event.${i}` } } });
    expect((await service.recordingEntryRemoval.remove({ projectId: project.id, recordingId: recording.recordingId, eventId: `event.${count - 1}` })).removedCount).toBe(1);
    const next = await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "marker", label: "unit new", timestamp: 4, metadata: { eventId: "event.new" } } });
    expect(next.timeline.map(entry => [entry.id, entry.sequence, entry.metadata?.eventId])).toEqual(Array.from({ length: count }, (_, i) => [`entry.${i}`, i, i === count - 1 ? "event.new" : `event.${i}`]));
    expect((await service.getRecordingSession(recording.recordingId, project.id)).timeline).toEqual(next.timeline);
    const typed = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: project.id });
    try { expect(await typed.readRecordingTimeline(recording.recordingId)).toEqual(next.timeline); }
    finally { await typed.close(); }
  });
  it.each([1, 2].flatMap(count => ["marker", "domain_event", "identical"].map(kind => ({ count, kind }))))("preserves undo then fresh public input without packet IDs ($count/$kind)", async ({ count, kind }) => {
    const { service, project, recording, pool } = await setup(true);
    for (let i = 0; i < count; i++) await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "domain_event", eventType: "unit.old", payload: { index: i }, timestamp: i + 2, metadata: { eventId: `event.${i}` } } });
    expect((await service.recordingEntryRemoval.remove({ projectId: project.id, recordingId: recording.recordingId, eventId: `event.${count - 1}` })).removedCount).toBe(1);
    const entry = kind === "marker" ? { type: "marker" as const, label: "unit fresh", timestamp: 4 }
      : { type: "domain_event" as const, eventType: kind === "identical" ? "unit.old" : "unit.fresh", payload: { index: kind === "identical" ? count - 1 : "new" }, timestamp: 4 };
    const next = await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry });
    expect(next.timeline.at(-1)).toMatchObject({ id: `entry.${count - 1}`, sequence: count - 1, ...entry });
    expect(next.timeline.at(-1)?.metadata?.eventId).toBeUndefined();
    const typed = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: project.id });
    try { expect(await typed.readRecordingTimeline(recording.recordingId)).toEqual(next.timeline); }
    finally { await typed.close(); }
  });
  it("recovers a landed removal after later publication fails and retries without a second control", async () => {
    const { service, project, recording, pool } = await setup(true);
    await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { id: "entry.a", type: "marker", label: "unit a", timestamp: 2, metadata: { eventId: "event.a" } } });
    const persist = service as unknown as { tryPersistRecordingSession: () => Promise<boolean> };
    const failure = vi.spyOn(persist, "tryPersistRecordingSession").mockRejectedValueOnce(new Error("Unit late removal failure"));
    await expect(service.recordingEntryRemoval.remove({ projectId: project.id, recordingId: recording.recordingId, eventId: "event.a" })).rejects.toThrow("Unit late removal failure");
    failure.mockRestore();
    expect((await service.getRecordingSession(recording.recordingId, project.id)).timeline).toEqual([]);
    expect((await service.recordingEntryRemoval.remove({ projectId: project.id, recordingId: recording.recordingId, eventId: "event.a" })).removedCount).toBe(0);
    const typed = await AutomationStudioProjectRuntimeStreamStore.open({ pool, projectId: project.id });
    try {
      expect(await typed.readRecordingTimeline(recording.recordingId)).toEqual([]);
      expect((await typed.listRecordingEvents({ recordingId: recording.recordingId })).lastSequence).toBe(2);
    } finally { await typed.close(); }
  });
  it("retains file-only read mode and refuses malformed or conflicting file entries", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-recording-file-"));
    roots.push(root);
    const file = path.join(root, "timeline.jsonl");
    const entry = { id: "entry.unit", sequence: 0, type: "marker", label: "unit" };
    await writeFile(file, JSON.stringify(entry));
    expect(await loadRecordingTimeline(file, "project.unit", "recording.unit")).toEqual([entry]);
    await writeFile(file, `${JSON.stringify(entry)}\n${JSON.stringify({ ...entry, label: "conflict" })}`);
    await expect(loadRecordingTimeline(file, "project.unit", "recording.unit")).rejects.toThrow(/conflict/);
    await writeFile(file, "not json");
    await expect(loadRecordingTimeline(file, "project.unit", "recording.unit")).rejects.toThrow();
  });
});
