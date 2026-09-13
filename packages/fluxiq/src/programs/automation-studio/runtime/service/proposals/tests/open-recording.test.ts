import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AutomationStudioService } from "../../../service.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioImporterSdkManifest } from "../../../../nodes/index.ts";
import { IoRegistry } from "../../../../../../io/index.ts";
import { openRecordingProposalNotice } from "../open-recording.ts";

// The subject is `openRecordingProposalNotice`, and the assertions that matter
// run it through `createRecordingFlowProposals`: a notice nobody reaches is
// worth nothing. The nearest directory holding both is `runtime/`, whose
// tests/ folder is at the structure audit's 25-file limit.

describe("proposals built from a recording that is still open", () => {
  let dataDir: string;
  let service: AutomationStudioService;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-open-recording-proposal-"));
    service = new AutomationStudioService({ dataDir, seedFixture: false })
      .bindIoRuntime(clickIoRegistry(), "example")
      .bindNativeNodeRuntime(clickMapperRuntime());
  });

  afterEach(async () => {
    await service.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  it("says the recording was unfinalized, in the result and on the stored proposal", async () => {
    const project = await service.createProject({ name: "Open recording proposal", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.still-open", domainId: "example", startedAt: 100, initialState: { timestamp: 100, namespaces: {} } });
    await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "observation", observationType: "clicked", payload: { inputId: "clicked" }, timestamp: 200, monotonicOffsetMs: 100 } });

    const open = await service.createRecordingFlowProposals({ projectId: project.id, recordingId: recording.recordingId });

    expect(open.proposals).toHaveLength(1);
    expect(open.issues).toEqual([expect.stringContaining("recording.still-open has not been finalized")]);
    expect(open.issues[0]).toContain("1 entries appended so far");
    expect(open.proposals[0]?.metadata).toMatchObject({ recordingOpenAtGeneration: true, recordingEntryCountAtGeneration: 1 });
    const stored = (await service.listPipelineArtifacts(project.id)).recordingFlowProposals
      .find((proposal) => proposal.proposalId === open.proposals[0]?.proposalId);
    expect(stored?.metadata).toMatchObject({ recordingOpenAtGeneration: true });
  });

  it("says nothing of the sort once the recording is finalized", async () => {
    const project = await service.createProject({ name: "Finalized recording proposal", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.closed", domainId: "example", startedAt: 100, initialState: { timestamp: 100, namespaces: {} } });
    await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "observation", observationType: "clicked", payload: { inputId: "clicked" }, timestamp: 200, monotonicOffsetMs: 100 } });
    await service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId, endedAt: 300 });

    const closed = await service.createRecordingFlowProposals({ projectId: project.id, recordingId: recording.recordingId });

    expect(closed.proposals).toHaveLength(1);
    expect(closed.issues).toEqual([]);
    expect(closed.proposals[0]?.metadata).toEqual({ rawEvidenceImmutable: true });
  });

  it("reports the open recording on the cached-proposal path too", async () => {
    const project = await service.createProject({ name: "Cached open proposal", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.cached-open", domainId: "example", startedAt: 100, initialState: { timestamp: 100, namespaces: {} } });
    await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "observation", observationType: "clicked", payload: { inputId: "clicked" }, timestamp: 200, monotonicOffsetMs: 100 } });

    const first = await service.createRecordingFlowProposals({ projectId: project.id, recordingId: recording.recordingId });
    const cached = await service.createRecordingFlowProposals({ projectId: project.id, recordingId: recording.recordingId });

    expect(cached.proposals.map((proposal) => proposal.proposalId)).toEqual(first.proposals.map((proposal) => proposal.proposalId));
    expect(cached.issues).toEqual([expect.stringContaining("has not been finalized")]);
  });

  it("is empty for a finalized recording and describes an open one", () => {
    const open = openRecordingProposalNotice({ recordingId: "recording.open", startedAt: 0, timeline: [{ id: "entry.1" }, { id: "entry.2" }] } as never);
    const finalized = openRecordingProposalNotice({ recordingId: "recording.closed", startedAt: 0, endedAt: 10, timeline: [] } as never);

    expect(open.metadata).toEqual({ recordingOpenAtGeneration: true, recordingEntryCountAtGeneration: 2 });
    expect(open.issues[0]).toContain("2 entries appended so far");
    expect(finalized).toEqual({ issues: [], metadata: {} });
  });
});

function clickIoRegistry(): IoRegistry {
  const io = new IoRegistry();
  io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId }) });
  return io;
}

function clickMapperRuntime(): AutomationStudioNativeNodeRuntime {
  const manifest: AutomationStudioImporterSdkManifest = {
    schemaVersion: "0.1",
    sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION,
    packageId: "example.importer",
    packageVersion: "1.0.0",
    domainId: "example",
    nodes: [],
    recordingMappers: [{ id: "click-mapper", version: "1.0.0", description: "Maps recorded clicks", outputIds: ["click"] }]
  };
  return new AutomationStudioNativeNodeRuntime().register(manifest, {
    packageId: "example.importer",
    packageVersion: "1.0.0",
    implementations: {},
    recordingMappers: {
      "click-mapper": (observation) => observation.type === "observation" ? { outputId: "click", parameters: { target: "submit" }, confidence: 0.9 } : null
    }
  });
}
