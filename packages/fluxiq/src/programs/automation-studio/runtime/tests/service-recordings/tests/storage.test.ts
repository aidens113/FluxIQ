import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stateValue, type StateSnapshot } from "../../../../model/index.ts";
import { AutomationStudioService } from "../../../service.ts";

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

  it("does not seed demo fixture recordings by default", async () => {
    const service = createService({ dataDir: tempRoot });

    await expect(service.listRecordingSessions()).resolves.toEqual([]);
    await expect(service.snapshot()).resolves.toMatchObject({
      canonical: {
        recordingSessions: [],
        normalizedTimelines: [],
        signalRegistries: [],
        learnedTaskModels: [],
        policyGraphs: []
      }
    });
  });

  it("keeps lightweight snapshots free of canonical recording payloads", async () => {
    const service = createService({ dataDir: tempRoot });
    const project = await service.createProject({ name: "Snapshot bounds", domainId: "example" });
    await service.createRecording({
      projectId: project.id,
      recordingId: "recording.snapshot-bound",
      domainId: "example",
      initialState: { timestamp: 1, namespaces: {} }
    });

    const lightweight = await service.snapshot("example", { includeCanonical: false });
    const compatible = await service.snapshot("example");

    expect(lightweight.canonical?.recordingSessions).toEqual([]);
    expect(lightweight.canonical?.normalizedTimelines).toEqual([]);
    expect(compatible.canonical?.recordingSessions.map((recording) => recording.recordingId)).toContain("recording.snapshot-bound");
  });

  it("normalizes recorded action element targets before storage", async () => {
    const service = createService({ dataDir: tempRoot });
    const project = await service.createProject({ name: "Element targets", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.element-target", domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: {
        type: "action",
        actionType: "click",
        parameters: {},
        target: { type: "client-target", metadata: { visibleText: "Save changes", testId: "save", selector: "button[data-testid='save']", token: "secret" } },
        origin: "operator",
        startedAt: 2,
        timestamp: 2
      }
    });
    const stored = await service.getRecordingSession(recording.recordingId, project.id);
    const action = stored.timeline.find((entry) => entry.type === "action");
    expect(action).toMatchObject({
      type: "action",
      target: { elementTarget: { kind: "element", fingerprint: { visibleText: "Save changes", testId: "save", selector: "button[data-testid='save']" } } },
      parameters: { target: { kind: "element", fingerprint: { testId: "save" } } }
    });
    expect((action as any)?.target?.elementTarget?.fingerprint?.metadata).toBeUndefined();
  });

  it("stores project recordings and normalized timelines in project folders", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "State Framework" });
    await expect(service.listProjectArtifacts(project.id)).resolves.toMatchObject({
      tasks: [],
      flows: []
    });
    const initialState: StateSnapshot = {
      timestamp: 1,
      namespaces: {
        runtime: {
          schemaId: "runtime",
          schemaVersion: "0.1",
          values: {
            phase: stateValue("string", "idle", 1)
          }
        }
      }
    };

    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.service-test",
      taskId: "task.service-test",
      initialState
    });
    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: {
        type: "marker",
        label: "Started"
      }
    });
    const normalized = await service.normalizeRecording({ projectId: project.id, recordingId: recording.recordingId });

    const reloaded = createService({ dataDir: tempRoot, seedFixture: false });
    const recordings = await reloaded.listRecordingSessions(project.id);

    expect(recordings.map((item) => item.recordingId)).toContain("recording.service-test");
    expect(normalized.recordingId).toBe("recording.service-test");

    const projectRoot = path.join(tempRoot, "programs", "automation-studio", "projects", project.id);
    await expect(readFile(path.join(projectRoot, "recordings", "recording.service-test", "recording.json"), "utf8")).resolves.toContain("\"recordingId\": \"recording.service-test\"");
    await expect(readFile(path.join(projectRoot, "recordings", "recording.service-test", "timeline.jsonl"), "utf8")).resolves.toContain("\"type\":\"marker\"");
    await expect(readFile(path.join(projectRoot, "recordings", "recording.service-test", "derived", "index.json"), "utf8")).resolves.toContain("\"recordingId\": \"recording.service-test\"");
    await expect(readFile(path.join(projectRoot, "recordings", "recording.service-test", "derived", "normalization", "timelines", `${normalized.normalizedTimelineId}.json`), "utf8")).resolves.toContain("\"normalizedTimelineId\"");
    await expect(readFile(path.join(projectRoot, "indexes", "recordings.json"), "utf8")).resolves.toContain("\"normalizedTimelineId\"");
  });

  it("persists rapid recording event bursts without colliding JSON temp files", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Event Burst" });
    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.event-burst",
      taskId: "task.event-burst",
      initialState: {
        timestamp: 1,
        namespaces: {}
      }
    });

    await Promise.all(Array.from({ length: 32 }, (_, index) => service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: {
        id: `marker.${index}`,
        type: "marker",
        label: `Burst ${index}`,
        timestamp: 1 + index
      }
    })));

    const stored = await service.getRecordingSession(recording.recordingId, project.id);

    expect(stored.timeline).toHaveLength(32);
  });

  it("lists project recording summaries without returning screenshot-heavy timelines", async () => {
    const service = createService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Recording summaries" });
    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.summary-list",
      taskId: "task.summary-list",
      initialState: { timestamp: 1, namespaces: {} }
    });
    await service.appendRecordingEvents({
      projectId: project.id,
      recordingId: recording.recordingId,
      entries: Array.from({ length: 8 }, (_, index) => ({
        id: `snapshot.${index}`,
        type: "observation",
        observationType: "client.state_snapshot",
        payload: {
          state: {
            timestamp: index + 2,
            namespaces: {},
            presentation: {
              visualFrames: [{
                id: "screen",
                coordinateSpace: { width: 100, height: 100, unit: "px" },
                layers: [{ id: "image", kind: "image", contentRef: `automation-object://project/${project.id}/${String(index).padStart(64, "0")}`, bounds: { x: 0, y: 0, width: 100, height: 100 } }]
              }]
            }
          }
        }
      }))
    });
    const projectRoot = path.join(tempRoot, "programs", "automation-studio", "projects", project.id);
    const recordingFile = path.join(projectRoot, "recordings", recording.recordingId, "recording.json");
    const activePersisted = JSON.parse(await readFile(recordingFile, "utf8")) as any;

    const summaries = await service.listRecordingSessionSummaries(project.id);
    const full = await service.getRecordingSession(recording.recordingId, project.id);

    expect(activePersisted.recording?.timeline ?? activePersisted.timeline ?? []).toHaveLength(0);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({ recordingId: recording.recordingId, metadata: { summaryOnly: true, eventCount: 8 } });
    expect(summaries[0]?.timeline).toEqual([]);
    expect(full.timeline).toHaveLength(8);

    await service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId, endedAt: 20 });
    const finalizedTimeline = await readFile(path.join(projectRoot, "recordings", recording.recordingId, "timeline.jsonl"), "utf8");
    expect(finalizedTimeline.trim().split(/\r?\n/)).toHaveLength(8);
  });

  it("accepts only registered domain recording events and records derived state", async () => {
    const service = createService({ seedFixture: false });
    service.registerRecordingDomain({
      domainId: "example.domain",
      label: "Example domain",
      schemaVersion: "0.1",
      events: [
        {
          eventType: "counter.changed",
          label: "Counter changed",
          payloadSchema: {
            type: "object",
            required: true,
            properties: {
              value: { type: "integer", required: true, label: "Counter value" }
            }
          },
          stateReducer: ({ event, previousState }) => ({
            state: {
              timestamp: event.timestamp ?? Date.now(),
              namespaces: {
                ...previousState.namespaces,
                example: {
                  schemaId: "example.counter",
                  schemaVersion: "0.1",
                  values: {
                    count: stateValue("integer", Number(event.payload?.value ?? 0), event.timestamp ?? Date.now())
                  }
                }
              }
            }
          }),
          observationExtractor: ({ event }) => ({
            observationType: "example.counter_observed",
            payload: { value: event.payload?.value ?? 0 }
          })
        }
      ]
    });
    const recording = await service.createRecording({
      recordingId: "recording.domain-test",
      initialState: { timestamp: 1, namespaces: {} }
    });

    const rejected = await service.appendRecordingDomainEvent({
      recordingId: recording.recordingId,
      domainId: "example.domain",
      eventType: "counter.changed",
      payload: { value: "wrong" }
    });
    expect(rejected.accepted).toBe(false);

    const accepted = await service.appendRecordingDomainEvent({
      recordingId: recording.recordingId,
      domainId: "example.domain",
      eventType: "counter.changed",
      timestamp: 10,
      payload: { value: 3 }
    });

    expect(accepted.accepted).toBe(true);
    expect(accepted.stateDeltas).toHaveLength(1);
    expect(accepted.recording.timeline.map((entry) => entry.type)).toEqual(["domain_event", "state_delta", "state_checkpoint", "observation"]);
    expect(service.validateRecordingDomainEvent({
      recordingId: recording.recordingId,
      domainId: "example.domain",
      eventType: "missing"
    }).ok).toBe(false);
  });
});
