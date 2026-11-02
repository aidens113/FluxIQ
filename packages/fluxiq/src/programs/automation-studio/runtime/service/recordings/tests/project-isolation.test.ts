// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { normalizeRecordingTimeline } from "../../../../normalization/index.ts";
import type { CanonicalAutomationStudioRepositories } from "../../../../storage/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import type { AutomationStudioRecordingStore } from "../store.ts";

const services: AutomationStudioService[] = [];
const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(services.splice(0).map(service => service.close()));
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 })));
});

async function setup(persistent = true) {
  const directory = persistent ? await mkdtemp(path.join(os.tmpdir(), "recording-project-isolation-")) : undefined;
  if (directory) directories.push(directory);
  const service = new AutomationStudioService({ ...(directory ? { dataDir: directory } : {}), seedFixture: false });
  services.push(service);
  const first = await service.createProject({ name: "First fixture project" });
  const second = await service.createProject({ name: "Second fixture project" });
  return { service, first: first.id, second: second.id, directory };
}

async function recording(service: AutomationStudioService, projectId: string, recordingId = "recording.shared") {
  return await service.createRecording({ projectId, recordingId, description: "An isolated fixture recording", startedAt: 1, initialState: { timestamp: 1, namespaces: {} } });
}

async function withTwoRecordings() {
  const context = await setup();
  await recording(context.service, context.first);
  await context.service.appendRecordingEvent({ projectId: context.first, recordingId: "recording.shared", entry: { id: "entry.first", type: "marker", label: "first", timestamp: 2 } });
  await recording(context.service, context.second);
  await context.service.appendRecordingEvent({ projectId: context.second, recordingId: "recording.shared", entry: { id: "entry.second", type: "marker", label: "second", timestamp: 3 } });
  return context;
}

it("keeps identical durable recording IDs isolated across serial and concurrent scoped reads", async () => {
  const { service, first, second } = await withTwoRecordings();
  for (const projectId of [first, second, first, second]) {
    const value = await service.getRecordingSession("recording.shared", projectId);
    expect(value.metadata.projectId).toBe(projectId);
    expect(value.timeline.map(entry => entry.id)).toEqual([projectId === first ? "entry.first" : "entry.second"]);
  }
  const values = await Promise.all([first, second, first, second].map(projectId => service.getRecordingSession("recording.shared", projectId)));
  expect(values.map(value => value.metadata.projectId)).toEqual([first, second, first, second]);
});

it("returns the scoped loaded value even when another project replaces the global mirror before load returns", async () => {
  const { service, first, second } = await withTwoRecordings();
  const store = (service as unknown as { recordings: AutomationStudioRecordingStore }).recordings;
  const load = store.loadProjectRecording.bind(store);
  vi.spyOn(store, "loadProjectRecording").mockImplementation(async (projectId, recordingId) => {
    const own = await load(projectId, recordingId);
    if (projectId === first) await load(second, recordingId);
    return own;
  });
  const value = await service.getRecordingSession("recording.shared", first);
  expect(value.metadata.projectId).toBe(first);
  expect(value.timeline.map(entry => entry.id)).toEqual(["entry.first"]);
});

it("appends and stops the addressed recording while a foreign same-ID recording is cached, including after reopen", async () => {
  const { service, first, second, directory } = await withTwoRecordings();
  await service.getRecordingSession("recording.shared", second);
  await service.appendRecordingEvent({ projectId: first, recordingId: "recording.shared", entry: { id: "entry.first.more", type: "marker", label: "first again", timestamp: 4 } });
  await service.getRecordingSession("recording.shared", second);
  await service.finalizeRecording({ projectId: first, recordingId: "recording.shared", endedAt: 5 });
  await service.close();
  const reopened = new AutomationStudioService({ dataDir: directory!, seedFixture: false });
  services.push(reopened);
  const own = await reopened.getRecordingSession("recording.shared", first);
  expect(own.metadata.projectId).toBe(first);
  expect(own.timeline.map(entry => entry.id)).toEqual(["entry.first", "entry.first.more"]);
  expect(own.endedAt).toBe(5);
  const foreign = await reopened.getRecordingSession("recording.shared", second);
  expect(foreign.metadata.projectId).toBe(second);
  expect(foreign.timeline.map(entry => entry.id)).toEqual(["entry.second"]);
  expect(foreign.endedAt).toBeUndefined();
});

it.each([true, false])("refuses a foreign cached recording when the addressed project has no such recording (persistent=%s)", async persistent => {
  const { service, first, second } = await setup(persistent);
  await recording(service, first, "recording.only-first");
  await expect(service.getRecordingSession("recording.only-first", second)).rejects.toThrow("Unknown Automation Studio recording");
  await expect(service.appendRecordingEvent({ projectId: second, recordingId: "recording.only-first", entry: { type: "marker", label: "must not land" } })).rejects.toThrow("Unknown Automation Studio recording");
  await expect(service.finalizeRecording({ projectId: second, recordingId: "recording.only-first" })).rejects.toThrow("Unknown Automation Studio recording");
  const actual = await service.getRecordingSession("recording.only-first", first);
  expect(actual.timeline).toEqual([]);
  expect(actual.endedAt).toBeUndefined();
});

it("refuses a memory-only cross-project ID collision without replacing the first recording", async () => {
  const { service, first, second } = await setup(false);
  await recording(service, first);
  await expect(recording(service, second)).rejects.toThrow("Recording ID is already owned by another project");
  expect((await service.getRecordingSession("recording.shared", first)).metadata.projectId).toBe(first);
  expect((await service.getRecordingSession("recording.shared")).metadata.projectId).toBe(first);
});

it("serializes memory-only collision check and put on the global recording ID", async () => {
  const { service, first, second } = await setup(false);
  const repository = (service as unknown as { repositories: CanonicalAutomationStudioRepositories }).repositories.recordingSessions;
  const put = repository.put.bind(repository);
  const writes = vi.spyOn(repository, "put").mockImplementation(async value => {
    await Promise.resolve();
    return await put(value);
  });
  const outcomes = await Promise.allSettled([recording(service, first), recording(service, second)]);
  expect(outcomes.map(outcome => outcome.status)).toEqual(["fulfilled", "rejected"]);
  expect(writes).toHaveBeenCalledTimes(1);
  expect((await service.getRecordingSession("recording.shared", first)).metadata.projectId).toBe(first);
});

it("keeps legitimate unscoped memory recording create/read/append/stop behavior", async () => {
  const { service } = await setup(false);
  await service.createRecording({ recordingId: "recording.unscoped", description: "An unscoped fixture", initialState: { timestamp: 1, namespaces: {} } });
  await service.appendRecordingEvent({ recordingId: "recording.unscoped", entry: { type: "marker", label: "legacy" } });
  const stopped = await service.finalizeRecording({ recordingId: "recording.unscoped", endedAt: Date.now() });
  expect(stopped.timeline).toMatchObject([{ type: "marker", label: "legacy" }]);
  expect((await service.getRecordingSession("recording.unscoped")).endedAt).toBe(stopped.endedAt);
});

it("lists the actual addressed project even when another project replaces the same-ID mirror during load", async () => {
  const { service, first, second } = await withTwoRecordings();
  const store = (service as unknown as { recordings: AutomationStudioRecordingStore }).recordings;
  const load = store.loadProjectRecording.bind(store);
  vi.spyOn(store, "loadProjectRecording").mockImplementation(async (projectId, recordingId) => {
    const own = await load(projectId, recordingId);
    if (projectId === first) await load(second, recordingId);
    return own;
  });
  const listed = await service.listRecordingSessions(first);
  expect(listed.map(value => [value.metadata.projectId, value.timeline.map(entry => entry.id)])).toEqual([[first, ["entry.first"]]]);
});

it("filters memory-only project lists without exposing another project's different recording", async () => {
  const { service, first, second } = await setup(false);
  await recording(service, first, "recording.first");
  await recording(service, second, "recording.second");
  expect((await service.listRecordingSessions(first)).map(value => value.recordingId)).toEqual(["recording.first"]);
});

it("ignores project labels on unscoped memory publications in scoped recording and normalized lists", async () => {
  const { service, first } = await setup(false);
  const store = (service as unknown as { recordings: AutomationStudioRecordingStore }).recordings;
  const original = await recording(service, first, "recording.owned");
  const owned = await store.normalizations.put(normalizeRecordingTimeline(original), first);
  const unscoped = await service.createRecording({ recordingId: "recording.unscoped", description: "An unscoped fixture", metadata: { projectId: first }, initialState: { timestamp: 1, namespaces: {} } });
  const normalized = normalizeRecordingTimeline(unscoped);
  await store.normalizations.put({ ...normalized, metadata: { ...normalized.metadata, projectId: first } });
  expect.soft((await service.listRecordingSessions(first)).map(value => value.recordingId)).toEqual(["recording.owned"]);
  expect((await service.listProjectNormalizedTimelines(first)).map(value => value.normalizedTimelineId)).toEqual([owned.normalizedTimelineId]);
});

it.each(["single", "bulk"] as const)("deletes only the addressed durable recording and preserves the same-ID decoy mirror/document (%s)", async mode => {
  const { service, first, second } = await withTwoRecordings();
  const repository = (service as unknown as { repositories: CanonicalAutomationStudioRepositories }).repositories.recordingSessions;
  const decoy = await repository.get("recording.shared");
  expect(decoy?.metadata.projectId).toBe(second);
  if (mode === "single") await service.deleteRecording({ projectId: first, recordingId: "recording.shared" });
  else await service.deleteRecordings({ projectId: first, recordingIds: ["recording.shared"] });
  expect(await repository.get("recording.shared")).toEqual(decoy);
  await expect(service.getRecordingSession("recording.shared", first)).rejects.toThrow("Unknown Automation Studio recording");
  expect((await service.getRecordingSession("recording.shared", second)).timeline.map(entry => entry.id)).toEqual(["entry.second"]);
  expect(await service.listRecordingSessions(first)).toEqual([]);
  expect((await service.listRecordingSessions(second)).map(value => value.recordingId)).toEqual(["recording.shared"]);
});

it.each(["single", "bulk"] as const)("refuses an unknown scoped ID before deleting a foreign memory recording (%s)", async mode => {
  const { service, first, second } = await setup(false);
  await recording(service, second, "recording.foreign");
  const deleting = mode === "single" ? service.deleteRecording({ projectId: first, recordingId: "recording.foreign" }) : service.deleteRecordings({ projectId: first, recordingIds: ["recording.foreign"] });
  await expect(deleting).rejects.toThrow("Unknown Automation Studio recording");
  expect((await service.getRecordingSession("recording.foreign", second)).metadata.projectId).toBe(second);
});

it("validates every bulk scoped address before deleting any owned document", async () => {
  const { service, first, second } = await withTwoRecordings();
  await expect(service.deleteRecordings({ projectId: first, recordingIds: ["recording.shared", "recording.missing"] })).rejects.toThrow("Unknown Automation Studio recording");
  expect((await service.getRecordingSession("recording.shared", first)).timeline.map(entry => entry.id)).toEqual(["entry.first"]);
  expect((await service.getRecordingSession("recording.shared", second)).timeline.map(entry => entry.id)).toEqual(["entry.second"]);
});

it("stamps the supplied project without an object store and ignores a foreign normalized mirror", async () => {
  const { service, first, second } = await withTwoRecordings();
  const normalized = await service.normalizeRecording({ projectId: first, recordingId: "recording.shared" });
  expect(normalized.metadata?.projectId).toBe(first);
  const repository = (service as unknown as { repositories: CanonicalAutomationStudioRepositories }).repositories.normalizedTimelines;
  const foreign = { ...normalized, metadata: { ...normalized.metadata, projectId: second, foreign: true } };
  await repository.put(foreign);
  const actual = await service.getProjectNormalizedTimeline(first, normalized.normalizedTimelineId);
  expect(actual.metadata?.projectId).toBe(first);
  expect(actual.metadata).not.toHaveProperty("foreign");
  expect((await service.listProjectNormalizedTimelines(first)).map(value => value.metadata?.projectId)).toEqual([first]);
  expect(await repository.get(normalized.normalizedTimelineId)).toEqual(foreign);
  await service.deleteRecording({ projectId: first, recordingId: "recording.shared" });
  expect(await repository.get(normalized.normalizedTimelineId)).toEqual(foreign);
});

it("uses the actual durable recording even when an unscoped body labels itself with that project", async () => {
  const { service, first } = await withTwoRecordings();
  await service.createRecording({ recordingId: "recording.shared", description: "An unrelated unscoped body", metadata: { projectId: first }, initialState: { timestamp: 1, namespaces: {} } });
  const actual = await service.getRecordingSession("recording.shared", first);
  expect(actual.description).toBe("An isolated fixture recording");
  expect(actual.timeline.map(entry => entry.id)).toEqual(["entry.first"]);
});

it("uses the actual normalized file/index even when the cached body claims the same project", async () => {
  const { service, first } = await withTwoRecordings();
  const normalized = await service.normalizeRecording({ projectId: first, recordingId: "recording.shared" });
  const repository = (service as unknown as { repositories: CanonicalAutomationStudioRepositories }).repositories.normalizedTimelines;
  await repository.put({ ...normalized, timeline: [], metadata: { ...normalized.metadata, forgedBody: true } });
  const actual = await service.getProjectNormalizedTimeline(first, normalized.normalizedTimelineId);
  expect(actual.timeline).toEqual(normalized.timeline);
  expect(actual.metadata).not.toHaveProperty("forgedBody");
});

it("lists all-project summaries by composite recording address without mislabelling a same-ID decoy", async () => {
  const { service, first, second } = await withTwoRecordings();
  await service.appendRecordingEvent({ projectId: first, recordingId: "recording.shared", entry: { id: "entry.first.extra", type: "marker", label: "first extra" } });
  await service.updateRecording({ projectId: second, recordingId: "recording.shared", name: "Second fixture" });
  const result = await service.listRecordingSummaries();
  const summaries = result.items.filter(summary => summary.id === "recording.shared");
  expect(summaries.map(summary => summary.projectId).sort()).toEqual([first, second].sort());
  expect(summaries.find(summary => summary.projectId === first)?.eventCount).toBe(2);
  expect(summaries.find(summary => summary.projectId === second)?.eventCount).toBe(1);
});
