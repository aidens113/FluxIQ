import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type StateSnapshot } from "../../../../model/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { type AutomationStudioImporterSdkManifest } from "../../../../nodes/index.ts";
import { IoRegistry } from "../../../../../../io/index.ts";
import type { JsonObject } from "../../../../../../core/index.ts";
import { stateFixture } from "../../service-fixtures.ts";

let tempRoot: string;

const services = new Set<AutomationStudioService>();

function createService(...args: ConstructorParameters<typeof AutomationStudioService>): AutomationStudioService {
  const service = new AutomationStudioService(...args);
  services.add(service);
  return service;
}

describe("AutomationStudioService recording persistence", () => {
  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-automation-studio-service-"));
  });

  afterEach(async () => {
    await Promise.all([...services].map((service) => service.close()));
    services.clear();
    await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  it("stores client state snapshots as recording-scoped object refs and hydrates them when opened", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const service = createService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    });
    const project = await service.createProject({ name: "Snapshot refs" });
    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.snapshot-refs",
      initialState: { timestamp: 1, namespaces: {} }
    });
    const state = {
      id: "snapshot.large",
      timestamp: 2,
      namespaces: {
        web: {
          schemaId: "web",
          schemaVersion: "0.1",
          values: { title: { type: "string", value: "Dashboard", observedAt: 2 } }
        }
      }
    } satisfies StateSnapshot;

    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: {
        type: "observation",
        observationType: "client.state_snapshot",
        correlationId: "snapshot.large",
        payload: { state, metadata: { viewportWidth: 1280 } }
      }
    });

    const raw = await service.listRecordingSessions(project.id);
    const rawEntry = raw.find((item) => item.recordingId === recording.recordingId)?.timeline[0];
    const rawPayload = rawEntry?.type === "observation" ? rawEntry.payload as any : null;
    const hydrated = await service.getRecordingSession(recording.recordingId, project.id);
    const hydratedPayload = hydrated.timeline[0]?.type === "observation" ? hydrated.timeline[0].payload as any : null;

    expect(rawPayload?.state).toBeUndefined();
    expect(rawPayload?.stateRef).toMatch(/^automation-object:\/\/project\//);
    expect(rawPayload?.metadata).toMatchObject({ viewportWidth: 1280, stateSnapshotSize: expect.any(Number) });
    expect(hydratedPayload?.state).toMatchObject({ id: "snapshot.large", namespaces: { web: { values: { title: { value: "Dashboard" } } } } });
  });

  it("writes recording state indexes with distinct action state links", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const service = createService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    });
    const project = await service.createProject({ name: "Indexed states" });
    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.indexed-states",
      initialState: { timestamp: 1, namespaces: {} }
    });

    await service.appendRecordingEvents({
      projectId: project.id,
      recordingId: recording.recordingId,
      entries: [
        { type: "observation", observationType: "client.state_snapshot", payload: { state: stateFixture("state.one", 10, "Before") as unknown as JsonObject } },
        { type: "action", actionType: "click", outputId: "click.first", parameters: {}, timestamp: 11, startedAt: 11, origin: "operator" },
        { type: "observation", observationType: "client.state_snapshot", payload: { state: stateFixture("state.two", 20, "After") as unknown as JsonObject } },
        { type: "action", actionType: "click", outputId: "click.second", parameters: {}, timestamp: 21, startedAt: 21, origin: "operator" }
      ]
    });

    const indexPath = path.join(tempRoot, "artifacts", "automation-studio", "projects", project.id, "recordings", recording.recordingId, "index.json");
    const index = JSON.parse(await readFile(indexPath, "utf8")) as any;
    expect(Object.keys(index.states)).toEqual(["state.one", "state.two"]);
    expect(Object.values(index.actions).map((action: any) => action.stateAtActionId)).toEqual(["state.one", "state.two"]);
    expect(index.states["state.one"].stateRef).not.toEqual(index.states["state.two"].stateRef);
  });

  it("uses referenced action entries for mapper candidate state links", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const io = new IoRegistry();
    io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId }) });
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "example.importer", packageVersion: "1.0.0", domainId: "example", nodes: [], recordingMappers: [{ id: "click-mapper", version: "1.0.0", description: "Maps observed clicks", outputIds: ["click"] }] };
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, {
      packageId: "example.importer",
      packageVersion: "1.0.0",
      implementations: {},
      recordingMappers: {
        "click-mapper": (observation) => observation.observationId === "entry.mapper"
          ? { outputId: "click", parameters: { target: "submit" }, sourceObservationIds: ["entry.action"], confidence: 0.9 }
          : null
      }
    });
    const service = createService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
    const project = await service.createProject({ name: "Mapper action state", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.mapper-action-state", domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
    await service.appendRecordingEvents({
      projectId: project.id,
      recordingId: recording.recordingId,
      entries: [
        { id: "entry.state.before", type: "observation", observationType: "client.state_snapshot", timestamp: 1, payload: { state: stateFixture("state.before", 1, "Before") as unknown as JsonObject } },
        { id: "entry.action", type: "action", actionType: "click", outputId: "click", parameters: {}, timestamp: 50, startedAt: 50, origin: "operator", metadata: { policyEligible: false } },
        { id: "entry.state.after", type: "observation", observationType: "client.state_snapshot", timestamp: 51, payload: { state: stateFixture("state.after", 51, "After") as unknown as JsonObject } },
        { id: "entry.mapper", type: "observation", observationType: "input.event", timestamp: 52, payload: { latestEvidence: true } }
      ]
    });

    const result = await service.createRecordingFlowProposals({ projectId: project.id, recordingId: recording.recordingId });
    const candidate = result.proposals[0]?.candidates[0];

    expect(candidate).toMatchObject({
      actionEntryId: "entry.action",
      sourceObservationIds: ["entry.mapper", "entry.action"],
      stateLink: { actionEntryId: "entry.action", stateSnapshotId: "state.after" }
    });
  });

  it("resolves recording entry state from the recording index without guessing another state", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const service = createService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    });
    const project = await service.createProject({ name: "Indexed state lookup" });
    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.indexed-state-lookup",
      initialState: { timestamp: 1, namespaces: {} }
    });

    await service.appendRecordingEvents({
      projectId: project.id,
      recordingId: recording.recordingId,
      entries: [
        { type: "observation", observationType: "client.state_snapshot", payload: { state: stateFixture("state.lookup", 10, "Lookup") as unknown as JsonObject } },
        { type: "action", actionType: "click", outputId: "click.lookup", parameters: {}, timestamp: 11, startedAt: 11, origin: "operator" }
      ]
    });

    const raw = await service.listRecordingSessions(project.id);
    const actionEntry = raw.find((item) => item.recordingId === recording.recordingId)?.timeline.find((entry) => entry.type === "action");
    expect(actionEntry).toBeDefined();
    const resolved = await service.getRecordingEntryState({
      projectId: project.id,
      recordingId: recording.recordingId,
      entryId: actionEntry!.id,
      includeState: true
    });

    expect(resolved.resolved).toMatchObject({ stateSnapshotId: "state.lookup", stateRef: expect.stringMatching(/^automation-object:\/\//) });
    expect(resolved.state).toMatchObject({ id: "state.lookup", namespaces: { web: { values: { title: { value: "Lookup" } } } } });
    await expect(service.getRecordingEntryState({
      projectId: project.id,
      recordingId: recording.recordingId,
      entryId: "entry.missing"
    })).resolves.toMatchObject({ resolved: null, reason: "Entry entry.missing is not indexed for recording recording.indexed-state-lookup." });
  });

  it("resolves unlinked timeline events to the latest prior state snapshot", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const service = createService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    });
    const project = await service.createProject({ name: "Timeline event state lookup" });
    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.timeline-event-state",
      initialState: { timestamp: 1, namespaces: {} }
    });

    await service.appendRecordingEvents({
      projectId: project.id,
      recordingId: recording.recordingId,
      entries: [
        { id: "entry.state.before", type: "observation", observationType: "client.state_snapshot", timestamp: 10, payload: { state: stateFixture("state.before", 10, "Before") as unknown as JsonObject } },
        { id: "entry.event.middle", type: "observation", observationType: "input.event", timestamp: 15, payload: { event: "middle" } },
        { id: "entry.state.after", type: "observation", observationType: "client.state_snapshot", timestamp: 20, payload: { state: stateFixture("state.after", 20, "After") as unknown as JsonObject } },
        { id: "entry.event.later", type: "observation", observationType: "input.event", timestamp: 25, payload: { event: "later" } }
      ]
    });

    await expect(service.getRecordingEntryState({
      projectId: project.id,
      recordingId: recording.recordingId,
      entryId: "entry.event.middle",
      includeState: true
    })).resolves.toMatchObject({
      resolved: { stateSnapshotId: "state.before" },
      state: { id: "state.before" }
    });
    await expect(service.getRecordingEntryState({
      projectId: project.id,
      recordingId: recording.recordingId,
      entryId: "entry.event.later",
      includeState: true
    })).resolves.toMatchObject({
      resolved: { stateSnapshotId: "state.after" },
      state: { id: "state.after" }
    });
  });

  it("repairs stale prior-state links before indexed state lookup", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const service = createService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    });
    const project = await service.createProject({ name: "Repair stale state links" });
    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.stale-state-link",
      initialState: { timestamp: 1, namespaces: {} }
    });

    await service.appendRecordingEvents({
      projectId: project.id,
      recordingId: recording.recordingId,
      entries: [
        { type: "observation", observationType: "client.state_snapshot", timestamp: 1, payload: { state: stateFixture("state.old", 1, "Old") as unknown as JsonObject } },
        { type: "action", actionType: "click", outputId: "click.target", parameters: {}, timestamp: 50, startedAt: 50, origin: "operator" },
        { type: "observation", observationType: "client.state_snapshot", timestamp: 51, payload: { state: stateFixture("state.closest", 51, "Closest") as unknown as JsonObject } }
      ]
    });

    const raw = await service.listRecordingSessions(project.id);
    const actionEntry = raw.find((item) => item.recordingId === recording.recordingId)?.timeline.find((entry) => entry.type === "action");
    expect(actionEntry).toBeDefined();
    const indexPath = path.join(tempRoot, "artifacts", "automation-studio", "projects", project.id, "recordings", recording.recordingId, "index.json");
    const poisoned = JSON.parse(await readFile(indexPath, "utf8")) as any;
    const action = Object.values(poisoned.actions)[0] as any;
    action.stateAtActionId = "state.old";
    poisoned.entries[action.entryId].stateSnapshotId = "state.old";
    await writeFile(indexPath, JSON.stringify(poisoned, null, 2), "utf8");

    const resolved = await service.getRecordingEntryState({
      projectId: project.id,
      recordingId: recording.recordingId,
      entryId: actionEntry!.id,
      includeState: true
    });

    expect(resolved.resolved?.stateSnapshotId).toBe("state.closest");
    expect(resolved.state).toMatchObject({ id: "state.closest" });
  });

  it("does not hydrate missing state refs while appending to recordings", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const service = createService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    });
    const project = await service.createProject({ name: "Missing state refs" });
    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.missing-state-ref",
      initialState: { timestamp: 1, namespaces: {} }
    });
    const state = {
      id: "snapshot.missing",
      timestamp: 2,
      namespaces: { web: { schemaId: "web", schemaVersion: "0.1", values: { ready: { type: "boolean", value: true, observedAt: 2 } } } }
    } satisfies StateSnapshot;

    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: { type: "observation", observationType: "client.state_snapshot", payload: { state } }
    });
    const raw = await service.listRecordingSessions(project.id);
    const rawEntry = raw.find((item) => item.recordingId === recording.recordingId)?.timeline[0];
    const stateRef = rawEntry?.type === "observation" && typeof rawEntry.payload?.stateRef === "string" ? rawEntry.payload.stateRef : "";
    const sha256 = /\/([a-f0-9]{64})$/i.exec(stateRef)?.[1] ?? "";
    await rm(path.join(tempRoot, "artifacts", "automation-studio", "projects", project.id, "recordings", recording.recordingId, "objects", `${sha256}.json`), { force: true });

    await expect(service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: { type: "observation", observationType: "clicked", payload: { inputId: "clicked" } }
    })).resolves.toMatchObject({ timeline: expect.arrayContaining([expect.objectContaining({ observationType: "clicked" })]) });

    const hydrated = await service.getRecordingSession(recording.recordingId, project.id);
    const payload = hydrated.timeline[0]?.type === "observation" ? hydrated.timeline[0].payload as any : null;
    expect(payload?.state).toBeUndefined();
    expect(payload?.metadata).toMatchObject({ missingStateRef: stateRef, stateRefHydrationError: expect.any(String) });
  });
});
