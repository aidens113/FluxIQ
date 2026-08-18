import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCallFlowNode, stateValue, type StateSnapshot } from "../model/index.ts";
import { generateFlowTypeScript } from "../dsl/index.ts";
import { AutomationStudioService } from "./service.ts";
import { AutomationStudioNativeNodeRuntime } from "./native-node-runtime.ts";
import type { AutomationStudioImporterSdkManifest } from "../nodes/index.ts";
import { IoRegistry, createEnvelope } from "../../../io/index.ts";
import type { JsonObject } from "../../../core/index.ts";

const tempRoot = path.join(process.cwd(), ".tmp", "automation-studio-service-test");

function stateFixture(id: string, timestamp: number, title: string): StateSnapshot {
  return {
    id,
    timestamp,
    namespaces: {
      web: {
        schemaId: "web",
        schemaVersion: "0.1",
        values: { title: { type: "string", value: title, observedAt: timestamp } }
      }
    }
  };
}

describe("AutomationStudioService recording persistence", () => {
  beforeEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("does not seed demo fixture recordings by default", async () => {
    const service = new AutomationStudioService({ dataDir: tempRoot });

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

  it("turns mapped observations into reviewed Flow actions without making action inputs policy state", async () => {
    const io = new IoRegistry();
    let dispatches = 0;
    io.registerInput("example", { definition: { id: "clicked", title: "Clicked", role: "action", outputId: "click" }, mode: "stream", subscribe: (handler) => { queueMicrotask(() => handler(createEnvelope({ domainId: "example", ioId: "clicked", payload: { ok: true } }))); return () => undefined; } });
    io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => { dispatches += 1; return { ok: true, domainId: "example", outputId: request.outputId, payload: { done: true } }; } });
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "example.importer", packageVersion: "1.0.0", domainId: "example", nodes: [], recordingMappers: [{ id: "click-mapper", version: "1.0.0", description: "Maps recorded clicks", outputIds: ["click"] }] };
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, { packageId: "example.importer", packageVersion: "1.0.0", implementations: {}, recordingMappers: { "click-mapper": (observation) => observation.type === "observation" ? { outputId: "click", parameters: { target: "submit" }, sourceInputIds: ["clicked"], expectedConfirmation: { inputId: "clicked", timeoutMs: 100 }, confidence: 0.9 } : null } });
    const service = new AutomationStudioService({ dataDir: tempRoot }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
    const project = await service.createProject({ name: "Mapped recording", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.mapped", domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
    await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "observation", observationType: "clicked", payload: { inputId: "clicked" } } });
    const { proposals: [proposal], issues } = await service.createRecordingFlowProposals({ projectId: project.id, recordingId: recording.recordingId });
    expect(issues).toEqual([]);
    expect(proposal?.candidates[0]).toMatchObject({ actionEntryId: proposal?.candidates[0]?.sourceObservationIds[0], outputId: "click", sourceInputIds: ["clicked"], policyStateEligible: false, expectedConfirmation: { inputId: "clicked" } });
    expect(proposal?.candidates[0]?.evidence).toEqual([{ layer: "recording", artifactId: recording.recordingId, entryId: proposal?.candidates[0]?.sourceObservationIds[0] }]);
    expect(proposal?.review).toBeUndefined();
    const reviewed = await service.reviewRecordingFlowProposal({
      projectId: project.id,
      proposalId: proposal!.proposalId,
      decision: "approved",
      destination: { kind: "flow", name: "Approved clicks" }
    });
    expect(reviewed.flow?.nodes[0]).toMatchObject({ definitionId: "builtin.policy.action", parameterValues: { outputId: "click", confirmationInputId: "clicked" }, metadata: { actionEntryId: proposal?.candidates[0]?.actionEntryId, timelineEntryId: proposal?.candidates[0]?.actionEntryId, rawEvidenceImmutable: true } });
    const savedEdit = await service.saveFlow({ projectId: project.id, flow: { ...reviewed.flow!, nodes: reviewed.flow!.nodes.map((node) => ({ ...node, label: "Edited click", metadata: { ...(node.metadata ?? {}), sourceObservationIds: ["forged"] } })) } });
    expect(savedEdit.nodes[0]).toMatchObject({ label: "Edited click", metadata: { sourceObservationIds: proposal!.candidates[0]!.sourceObservationIds, manualProvenance: [{ changedFields: ["label"] }] } });
    const session = await service.runRuntimeSession({ projectId: project.id, flowId: reviewed.flow!.flowId });
    expect(session.status).toBe("succeeded");
    expect(dispatches).toBe(1);

    const withoutConfirmation = new IoRegistry();
    withoutConfirmation.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId }) });
    service.bindIoRuntime(withoutConfirmation, "example");
    const confirmationInvalidated = (await service.listPipelineArtifacts(project.id, { revalidateRecordingFlowProposals: true })).recordingFlowProposals.find((item) => item.proposalId === proposal!.proposalId);
    expect(confirmationInvalidated?.status).toBe("invalidated");
    expect(confirmationInvalidated?.invalidation?.reasons).toEqual(expect.arrayContaining([expect.stringContaining("Confirmation input clicked")]));

    const changedManifest = { ...manifest, packageVersion: "2.0.0", recordingMappers: [{ ...manifest.recordingMappers![0]!, version: "2.0.0" }] };
    const changedRuntime = new AutomationStudioNativeNodeRuntime().register(changedManifest, { packageId: "example.importer", packageVersion: "2.0.0", implementations: {}, recordingMappers: { "click-mapper": () => null } });
    service.bindNativeNodeRuntime(changedRuntime);
    const invalidated = (await service.listPipelineArtifacts(project.id, { revalidateRecordingFlowProposals: true })).recordingFlowProposals.find((item) => item.proposalId === proposal!.proposalId);
    expect(invalidated).toMatchObject({ status: "invalidated", invalidation: { affectedFlowIds: [reviewed.flow!.flowId] } });
  });

  it("generates multiple proposal attempts and deletes one without deleting the recording", async () => {
    const io = new IoRegistry();
    io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId }) });
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "example.importer", packageVersion: "1.0.0", domainId: "example", nodes: [], recordingMappers: [{ id: "click-mapper", version: "1.0.0", description: "Maps clicks", outputIds: ["click"] }] };
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, { packageId: "example.importer", packageVersion: "1.0.0", implementations: {}, recordingMappers: { "click-mapper": () => ({ outputId: "click", parameters: { target: "submit" }, sourceObservationIds: ["entry.shared-state"], confidence: 0.9 }) } });
    const service = new AutomationStudioService({ dataDir: tempRoot }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
    const project = await service.createProject({ name: "Proposal attempts", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.attempts", domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
    await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "observation", observationType: "clicked", payload: { inputId: "clicked" } } });
    await service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId });

    const first = await service.generateRecordingProposal({ projectId: project.id, recordingId: recording.recordingId, mode: "direct" });
    const second = await service.generateRecordingProposal({ projectId: project.id, recordingId: recording.recordingId, mode: "llm_assisted", title: "Clean checkout", instructions: "Prefer one reusable click action." });
    const firstProposalId = first.recordingFlowProposals![0]!.proposalId;
    const secondProposalId = second.recordingFlowProposals![0]!.proposalId;
    const firstCandidate = first.recordingFlowProposals![0]!.candidates[0]!;

    expect(firstProposalId).not.toBe(secondProposalId);
    expect(firstCandidate.actionEntryId).toBe(firstCandidate.sourceObservationIds[0]);
    expect(firstCandidate.sourceObservationIds).toContain("entry.shared-state");
    expect(second.recordingFlowProposals![0]!.metadata).toMatchObject({ generationMode: "llm_assisted", title: "Clean checkout", instructions: "Prefer one reusable click action." });
    expect((await service.listPipelineArtifacts(project.id)).recordingFlowProposals.map((proposal) => proposal.proposalId)).toEqual(expect.arrayContaining([firstProposalId, secondProposalId]));

    await service.deleteProposal({ projectId: project.id, proposalId: firstProposalId });

    const artifacts = await service.listPipelineArtifacts(project.id);
    expect(artifacts.recordingFlowProposals.map((proposal) => proposal.proposalId)).toContain(secondProposalId);
    expect(artifacts.recordingFlowProposals.map((proposal) => proposal.proposalId)).not.toContain(firstProposalId);
    await expect(service.getRecordingSession(recording.recordingId, project.id)).resolves.toMatchObject({ recordingId: recording.recordingId });
  });

  it("returns lightweight project workspace summaries for sidebar loading", async () => {
    const io = new IoRegistry();
    io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId }) });
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "example.importer", packageVersion: "1.0.0", domainId: "example", nodes: [], recordingMappers: [{ id: "click-mapper", version: "1.0.0", description: "Maps clicks", outputIds: ["click"] }] };
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, { packageId: "example.importer", packageVersion: "1.0.0", implementations: {}, recordingMappers: { "click-mapper": () => ({ outputId: "click", parameters: { target: "submit" }, confidence: 0.9 }) } });
    const service = new AutomationStudioService({ dataDir: tempRoot }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
    const project = await service.createProject({ name: "Workspace summary", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.summary", domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
    await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "observation", observationType: "clicked", payload: { inputId: "clicked" } } });
    await service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId });
    const generated = await service.generateRecordingProposal({ projectId: project.id, recordingId: recording.recordingId, mode: "direct" });
    await service.createFlow({ projectId: project.id, flowId: "flow.summary", name: "Summary flow" });

    const summary = await service.getProjectWorkspaceSummary(project.id);

    expect(summary.project).toMatchObject({ projectId: project.id, counts: { recordings: 1, proposals: 1, flows: 1 } });
    expect(summary.recordings).toEqual([expect.objectContaining({ recordingId: recording.recordingId, proposalCount: 1 })]);
    expect(summary.recordings[0]).not.toHaveProperty("timeline");
    expect(summary.proposals).toEqual([expect.objectContaining({ proposalId: generated.recordingFlowProposals![0]!.proposalId, recordingId: recording.recordingId, kind: "recording_flow" })]);
    expect(summary.flows).toEqual([expect.objectContaining({ flowId: "flow.summary", nodeCount: 0, edgeCount: 0 })]);
  });

  it("ignores stale object-backed proposal artifacts during proposal refresh", async () => {
    const io = new IoRegistry();
    io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId }) });
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "example.importer", packageVersion: "1.0.0", domainId: "example", nodes: [], recordingMappers: [{ id: "click-mapper", version: "1.0.0", description: "Maps clicks", outputIds: ["click"] }] };
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, { packageId: "example.importer", packageVersion: "1.0.0", implementations: {}, recordingMappers: { "click-mapper": () => ({ outputId: "click", parameters: { target: "submit", payload: "x".repeat(300_000) }, confidence: 0.9 }) } });
    const service = new AutomationStudioService({ dataDir: tempRoot }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
    const project = await service.createProject({ name: "Stale proposal object", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.stale-proposal-object", domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
    await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "observation", observationType: "clicked", payload: { inputId: "clicked" } } });
    await service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId });
    const generated = await service.generateRecordingProposal({ projectId: project.id, recordingId: recording.recordingId, mode: "direct" });
    const staleProposalId = generated.recordingFlowProposals![0]!.proposalId;
    const sharedObjectDir = path.join(tempRoot, "artifacts", "automation-studio", "projects", project.id, "objects", "shared");
    const sharedObjects = await readdir(sharedObjectDir).catch(() => []);
    await Promise.all(sharedObjects.map((fileName) => rm(path.join(sharedObjectDir, fileName), { force: true })));

    const artifacts = await service.listPipelineArtifacts(project.id);
    expect(artifacts.recordingFlowProposals.map((proposal) => proposal.proposalId)).toContain(staleProposalId);

    const regenerated = await service.generateRecordingProposal({ projectId: project.id, recordingId: recording.recordingId, mode: "direct" });
    expect(regenerated.recordingFlowProposals?.[0]?.proposalId).toBeTruthy();
  });

  it("reports when direct generation produces no proposal artifact", async () => {
    const service = new AutomationStudioService({ dataDir: tempRoot });
    const project = await service.createProject({ name: "Empty proposal generation", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.empty-proposal", domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
    await service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId });

    const result = await service.generateRecordingProposal({ projectId: project.id, recordingId: recording.recordingId, mode: "direct" });

    expect(result.proposal).toBeUndefined();
    expect(result.recordingFlowProposals).toBeUndefined();
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("reports when proposal mapping has state snapshots but no actions", async () => {
    const io = new IoRegistry();
    io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId }) });
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "example.importer", packageVersion: "1.0.0", domainId: "example", nodes: [], recordingMappers: [{ id: "click-mapper", version: "1.0.0", description: "Maps clicks", outputIds: ["click"] }] };
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, { packageId: "example.importer", packageVersion: "1.0.0", implementations: {}, recordingMappers: { "click-mapper": () => null } });
    const service = new AutomationStudioService({ dataDir: tempRoot }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
    const project = await service.createProject({ name: "State-only proposal generation", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.state-only-proposal", domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
    await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "observation", observationType: "client.state_snapshot", payload: { state: { timestamp: 2, namespaces: {} } } } });
    await service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId });

    const result = await service.generateRecordingProposal({ projectId: project.id, recordingId: recording.recordingId, mode: "direct" });

    expect(result.recordingFlowProposals).toBeUndefined();
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.stringContaining("No mapper-visible entries remained"),
      expect.stringContaining("No proposal artifact was generated")
    ]));
  });

  it("creates proposal candidates directly from normalized action entries when mapper does not remap them", async () => {
    const io = new IoRegistry();
    io.registerInput("example", { definition: { id: "clicked", title: "Clicked", role: "action", outputId: "click" }, mode: "stream", subscribe: () => () => undefined });
    io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId }) });
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "example.importer", packageVersion: "1.0.0", domainId: "example", nodes: [], recordingMappers: [{ id: "click-mapper", version: "1.0.0", description: "Maps clicks", outputIds: ["click"] }] };
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, { packageId: "example.importer", packageVersion: "1.0.0", implementations: {}, recordingMappers: { "click-mapper": () => null } });
    const service = new AutomationStudioService({ dataDir: tempRoot }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
    const project = await service.createProject({ name: "Direct action proposals", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.direct-action-proposal", domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: {
        type: "action",
        actionType: "click",
        outputId: "click",
        confirmationInputId: "clicked",
        parameters: { target: "submit" },
        origin: "operator",
        startedAt: 2,
        completedAt: 2,
        metadata: { inputId: "clicked", policyEligible: true }
      }
    });
    await service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId });

    const result = await service.generateRecordingProposal({ projectId: project.id, recordingId: recording.recordingId, mode: "direct" });

    expect(result.recordingFlowProposals?.[0]?.candidates[0]).toMatchObject({
      outputId: "click",
      parameters: { target: "submit" },
      sourceInputIds: ["clicked"],
      expectedConfirmation: { inputId: "clicked" }
    });
  });

  it("uses action events as mapper inputs and leaves state snapshots as linked context", async () => {
    const io = new IoRegistry();
    io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId }) });
    const seenObservationIds: string[] = [];
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "example.importer", packageVersion: "1.0.0", domainId: "example", nodes: [], recordingMappers: [{ id: "click-mapper", version: "1.0.0", description: "Maps recorded clicks", outputIds: ["click"] }] };
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, {
      packageId: "example.importer",
      packageVersion: "1.0.0",
      implementations: {},
      recordingMappers: {
        "click-mapper": (observation) => {
          seenObservationIds.push(observation.observationId);
          return observation.type === "action"
            ? { outputId: "click", parameters: { target: "submit" }, confidence: 0.9 }
            : null;
        }
      }
    });
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
    const project = await service.createProject({ name: "Compacted mapper recording", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.mapper-compaction", domainId: "example", startedAt: 0, initialState: { timestamp: 0, namespaces: {} } });
    await service.appendRecordingEvents({
      projectId: project.id,
      recordingId: recording.recordingId,
      entries: [
        ...[100, 500, 900].map((offset) => ({
          id: `snapshot.${offset}`,
          type: "observation",
          observationType: "client.state_snapshot",
          timestamp: offset,
          payload: { state: { timestamp: offset, namespaces: { web: { schemaId: "web", schemaVersion: "0.1", values: { frame: stateValue("integer", offset, offset) } } } } }
        } as any)),
        { id: "action.click", type: "action", actionType: "click", parameters: {}, origin: "operator", timestamp: 1_000, monotonicOffsetMs: 1_000, startedAt: 1_000 } as any,
        ...[1_100, 1_500, 2_000].map((offset) => ({
          id: `snapshot.${offset}`,
          type: "observation",
          observationType: "client.state_snapshot",
          timestamp: offset,
          payload: { state: { timestamp: offset, namespaces: { web: { schemaId: "web", schemaVersion: "0.1", values: { frame: stateValue("integer", offset, offset) } } } } }
        } as any))
      ]
    });

    const { proposals, issues } = await service.createRecordingFlowProposals({ projectId: project.id, recordingId: recording.recordingId });
    await service.normalizeRecording({ projectId: project.id, recordingId: recording.recordingId });
    const review = await service.createNormalizationReview({ projectId: project.id, recordingId: recording.recordingId });

    expect(proposals).toHaveLength(1);
    expect(seenObservationIds).toEqual(["action.click"]);
    expect(issues).not.toContain("Compacted 2 high-frequency state entries before mapper proposal generation. Raw recording data was preserved.");
    expect(review.mappings).toHaveLength(2);
    expect(review.mappings).toContainEqual(expect.objectContaining({
      rawEntryId: `compacted.high-frequency-state.${recording.recordingId}`,
      status: "dropped",
      reason: "6 high-frequency state entries were preserved in the raw recording but omitted from proposal review mappings."
    }));
    await expect(service.getRecordingSession(recording.recordingId, project.id)).resolves.toMatchObject({ timeline: expect.arrayContaining([expect.objectContaining({ id: "snapshot.500" }), expect.objectContaining({ id: "snapshot.1500" })]) });
  });

  it("processes extension recordings into recording Flow proposals instead of blank policy proposals", async () => {
    const io = new IoRegistry();
    io.registerInput("example", { definition: { id: "clicked", title: "Clicked", role: "action", outputId: "click" }, mode: "stream", subscribe: () => () => undefined });
    io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId }) });
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "example.importer", packageVersion: "1.0.0", domainId: "example", nodes: [], recordingMappers: [{ id: "click-mapper", version: "1.0.0", description: "Maps recorded clicks", outputIds: ["click"] }] };
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, { packageId: "example.importer", packageVersion: "1.0.0", implementations: {}, recordingMappers: { "click-mapper": (observation) => observation.type === "observation" ? { outputId: "click", parameters: { target: "submit" }, sourceInputIds: ["clicked"], expectedConfirmation: { inputId: "clicked", timeoutMs: 100 }, confidence: 0.9 } : null } });
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
    const project = await service.createProject({ name: "Extension Process", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.extension-process", domainId: "example", startedAt: 100, initialState: { timestamp: 100, namespaces: {} } });
    await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "observation", observationType: "clicked", payload: { inputId: "clicked" }, timestamp: 200, monotonicOffsetMs: 100 } });
    await service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId, endedAt: 300 });

    const processed = await service.processFinalizedRecording({ projectId: project.id, recordingId: recording.recordingId });
    const artifacts = await service.listPipelineArtifacts(project.id);

    expect(processed.status).toBe("processed");
    expect(processed.proposal).toBeUndefined();
    expect(processed.recordingFlowProposals?.[0]?.candidates[0]).toMatchObject({ outputId: "click", policyStateEligible: false });
    expect(artifacts.policyProposals.filter((proposal) => proposal.metadata?.recordingId === recording.recordingId)).toEqual([]);
    expect(artifacts.recordingFlowProposals.filter((proposal) => proposal.recordingId === recording.recordingId)).toHaveLength(1);
    expect(artifacts.normalizationReviews.filter((review) => review.recordingId === recording.recordingId)).toEqual([]);
    expect(artifacts.miningRuns.filter((run) => run.metadata?.recordingId === recording.recordingId)).toEqual([]);
  });

  it("reuses current recording Flow proposals without remapping unchanged recordings", async () => {
    const io = new IoRegistry();
    io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId }) });
    let mapperCalls = 0;
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "example.importer", packageVersion: "1.0.0", domainId: "example", nodes: [], recordingMappers: [{ id: "click-mapper", version: "1.0.0", description: "Maps recorded clicks", outputIds: ["click"] }] };
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, {
      packageId: "example.importer",
      packageVersion: "1.0.0",
      implementations: {},
      recordingMappers: {
        "click-mapper": (observation) => {
          mapperCalls += 1;
          return observation.type === "observation" ? { outputId: "click", parameters: { target: "submit" }, confidence: 0.9 } : null;
        }
      }
    });
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
    const project = await service.createProject({ name: "Cached mapper proposal", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.cached-mapper", domainId: "example", startedAt: 100, initialState: { timestamp: 100, namespaces: {} } });
    await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "observation", observationType: "clicked", payload: { inputId: "clicked" }, timestamp: 200, monotonicOffsetMs: 100 } });
    await service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId, endedAt: 300 });

    const first = await service.createRecordingFlowProposals({ projectId: project.id, recordingId: recording.recordingId });
    const callsAfterFirst = mapperCalls;
    const second = await service.createRecordingFlowProposals({ projectId: project.id, recordingId: recording.recordingId });
    const callsAfterSecond = mapperCalls;
    const forced = await service.createRecordingFlowProposals({ projectId: project.id, recordingId: recording.recordingId, force: true });

    expect(first.proposals).toHaveLength(1);
    expect(second.proposals.map((proposal) => proposal.proposalId)).toEqual(first.proposals.map((proposal) => proposal.proposalId));
    expect(callsAfterSecond).toBe(callsAfterFirst);
    expect(mapperCalls - callsAfterSecond).toBe(1);
    expect(forced.proposals[0]?.proposalId).not.toBe(first.proposals[0]?.proposalId);
  });

  it("stores project state image assets as digest-addressed object references", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const service = new AutomationStudioService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    });
    const project = await service.createProject({ name: "State assets" });
    const content = Buffer.from("png-bytes");
    const sha256 = createHash("sha256").update(content).digest("hex");

    const asset = await service.writeProjectObjectAsset({
      projectId: project.id,
      recordingId: "recording.capture",
      content,
      mediaType: "image/png",
      expectedSha256: sha256
    });

    expect(asset).toEqual({
      sha256,
      size: content.byteLength,
      mediaType: "image/png",
      contentRef: `automation-object://project/${encodeURIComponent(project.id)}/${sha256}`,
      apiPath: `/api/programs/automation-studio/state-assets/${encodeURIComponent(project.id)}/${sha256}`
    });
    await expect(service.readProjectObjectAsset(project.id, sha256)).resolves.toMatchObject({
      sha256,
      size: content.byteLength,
      mediaType: "image/png",
      content
    });
    await expect(readFile(path.join(tempRoot, "artifacts", "automation-studio", "projects", project.id, "recordings", "recording.capture", "objects", `${sha256}.png`))).resolves.toEqual(content);
  });

  it("rejects state image assets whose bytes do not match the requested digest", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const service = new AutomationStudioService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    });
    const project = await service.createProject({ name: "State asset mismatch" });

    await expect(service.writeProjectObjectAsset({
      projectId: project.id,
      content: Buffer.from("different-bytes"),
      mediaType: "image/png",
      expectedSha256: "0".repeat(64)
    })).rejects.toThrow("digest does not match");
  });

  it("deletes recording-owned state image assets when no remaining recording references them", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const service = new AutomationStudioService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    });
    const project = await service.createProject({ name: "Recording asset cleanup" });
    const content = Buffer.from("recording-screenshot");
    const sha256 = createHash("sha256").update(content).digest("hex");
    const asset = await service.writeProjectObjectAsset({ projectId: project.id, recordingId: "recording.with-screenshot", content, mediaType: "image/png", expectedSha256: sha256 });
    const orphanContent = Buffer.from("old-orphan-screenshot");
    const orphanSha256 = createHash("sha256").update(orphanContent).digest("hex");
    await service.writeProjectObjectAsset({ projectId: project.id, recordingId: "recording.with-screenshot", content: orphanContent, mediaType: "image/png", expectedSha256: orphanSha256 });
    const state = {
      timestamp: 1,
      namespaces: {},
      presentation: {
        defaultFrameId: "screen",
        visualFrames: [{
          id: "screen",
          coordinateSpace: { width: 100, height: 100, unit: "px" },
          layers: [{ id: "image", kind: "image", contentRef: asset.contentRef, bounds: { x: 0, y: 0, width: 100, height: 100 } }]
        }]
      }
    } satisfies StateSnapshot;
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.with-screenshot", initialState: { timestamp: 0, namespaces: {} } });
    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: { type: "observation", observationType: "client.state_snapshot", payload: { state } }
    });

    await service.deleteRecording({ projectId: project.id, recordingId: recording.recordingId });

    await expect(service.readProjectObjectAsset(project.id, sha256)).rejects.toThrow("not found");
    await expect(service.readProjectObjectAsset(project.id, orphanSha256)).rejects.toThrow("not found");
    await expect(readFile(path.join(tempRoot, "artifacts", "automation-studio", "projects", project.id, "recordings", recording.recordingId, "objects", `${sha256}.png`))).rejects.toThrow();
  });

  it("deletes unindexed files left under the recording session directory", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const service = new AutomationStudioService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    });
    const project = await service.createProject({ name: "Recording directory cleanup" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.with-leftovers", initialState: { timestamp: 0, namespaces: {} } });
    const sessionDir = path.join(tempRoot, "artifacts", "automation-studio", "projects", project.id, "recordings", recording.recordingId);
    await mkdir(path.join(sessionDir, "objects"), { recursive: true });
    await mkdir(path.join(sessionDir, "derived", "custom"), { recursive: true });
    await writeFile(path.join(sessionDir, "objects", "unindexed.png"), "stale image", "utf8");
    await writeFile(path.join(sessionDir, "derived", "custom", "leftover.json"), JSON.stringify({ recordingId: recording.recordingId }), "utf8");
    const oldDeletedSessionDir = path.join(tempRoot, "artifacts", "automation-studio", "projects", project.id, "recordings", "recording.old-deleted");
    await mkdir(path.join(oldDeletedSessionDir, "objects"), { recursive: true });
    await writeFile(path.join(oldDeletedSessionDir, "objects", "leftover.png"), "old stale image", "utf8");

    await service.deleteRecording({ projectId: project.id, recordingId: recording.recordingId });

    await expect(readdir(sessionDir)).rejects.toThrow();
    await expect(readdir(oldDeletedSessionDir)).rejects.toThrow();
  });

  it("deletes stale shared pipeline artifacts owned by the deleted recording", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const service = new AutomationStudioService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    });
    const project = await service.createProject({ name: "Shared pipeline cleanup" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.shared-artifacts", initialState: { timestamp: 0, namespaces: {} } });
    const projectDir = path.join(tempRoot, "artifacts", "automation-studio", "projects", project.id);
    const sharedFact = path.join(projectDir, "pipeline", "shared", "evidence", "facts", "fact.stale.json");
    const pipelineIndex = path.join(projectDir, "indexes", "pipeline.json");
    await mkdir(path.dirname(sharedFact), { recursive: true });
    await mkdir(path.dirname(pipelineIndex), { recursive: true });
    await writeFile(sharedFact, JSON.stringify({ factId: "fact.stale", recordingId: recording.recordingId, value: true }), "utf8");
    await writeFile(pipelineIndex, JSON.stringify({
      pipelines: [],
      normalizationReviews: [],
      miningRuns: [],
      evidenceFacts: [{ factId: "fact.stale", generatedAt: 1, recordingId: recording.recordingId }],
      evidenceObservations: [],
      stateActionCorrelations: [],
      evidenceClaims: [],
      learnedTaskModels: [],
      policyProposals: [],
      recordingFlowProposals: [],
      replayResults: []
    }, null, 2), "utf8");

    await service.deleteRecording({ projectId: project.id, recordingId: recording.recordingId });

    await expect(readFile(sharedFact, "utf8")).rejects.toThrow();
    const index = JSON.parse(await readFile(pipelineIndex, "utf8")) as { evidenceFacts: unknown[] };
    expect(index.evidenceFacts).toEqual([]);
  });

  it("keeps deleted recording assets that are still referenced by another recording", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const service = new AutomationStudioService({
      dataDir: tempRoot,
      storageRootDir: path.join(tempRoot, "artifacts", "automation-studio"),
      seedFixture: false
    });
    const project = await service.createProject({ name: "Shared asset cleanup" });
    const content = Buffer.from("shared-screenshot");
    const sha256 = createHash("sha256").update(content).digest("hex");
    const asset = await service.writeProjectObjectAsset({ projectId: project.id, content, mediaType: "image/png", expectedSha256: sha256 });
    const state = {
      timestamp: 1,
      namespaces: {},
      presentation: {
        visualFrames: [{
          id: "screen",
          coordinateSpace: { width: 100, height: 100, unit: "px" },
          layers: [{ id: "image", kind: "image", contentRef: asset.contentRef, bounds: { x: 0, y: 0, width: 100, height: 100 } }]
        }]
      }
    } satisfies StateSnapshot;
    const deleted = await service.createRecording({ projectId: project.id, recordingId: "recording.deleted", initialState: state });
    await service.createRecording({ projectId: project.id, recordingId: "recording.kept", initialState: state });

    await service.deleteRecording({ projectId: project.id, recordingId: deleted.recordingId });

    await expect(service.readProjectObjectAsset(project.id, sha256)).resolves.toMatchObject({ sha256, content });
  });

  it("approves edited recording Flow proposal graphs into Flows", async () => {
    const io = new IoRegistry();
    io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId }) });
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "example.importer", packageVersion: "1.0.0", domainId: "example", nodes: [], recordingMappers: [{ id: "click-mapper", version: "1.0.0", description: "Maps recorded clicks", outputIds: ["click"] }] };
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, { packageId: "example.importer", packageVersion: "1.0.0", implementations: {}, recordingMappers: { "click-mapper": (observation) => observation.type === "observation" ? { outputId: "click", parameters: { target: "submit" }, confidence: 0.9 } : null } });
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
    const project = await service.createProject({ name: "Edited Mapper Approval", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.edited-mapper", domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
    await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "observation", observationType: "clicked", payload: { inputId: "clicked" } } });
    const { proposals: [proposal] } = await service.createRecordingFlowProposals({ projectId: project.id, recordingId: recording.recordingId });

    const reviewed = await service.reviewRecordingFlowProposal({
      projectId: project.id,
      proposalId: proposal!.proposalId,
      decision: "approved",
      destination: { kind: "flow", name: "Edited mapped flow" },
      policyOverride: {
        schemaVersion: "0.1",
        version: "1.0.0",
        policyId: "policy.edited-recording-proposal",
        taskId: "task.edited-recording-proposal",
        sourceEvidence: [{ layer: "raw_recording", artifactId: recording.recordingId }],
        generatedMetadata: { generatedBy: "user", generatedAt: 2, confidence: 0.8 },
        nodes: [{
          id: "node.edited-click",
          label: "Edited click proposal",
          description: "Edited before approval.",
          eligibility: { type: "all", conditions: [] },
          actions: [{ id: "action.edited-click", actionType: "click", outputId: "click", parameters: { target: "submit" } }],
          successConditions: { type: "all", conditions: [] },
          failureConditions: { type: "none", conditions: [] },
          timeout: { timeoutMs: 5000 },
          retry: { maxAttempts: 1, backoffMs: 500 },
          recovery: { strategy: "pause" },
          outgoingEdges: [],
          sourceEvidence: [{ layer: "raw_recording", artifactId: recording.recordingId, entryId: "entry.1" }],
          generatedMetadata: { generatedBy: "user", generatedAt: 2, confidence: 0.8 }
        }],
        edges: []
      }
    });

    expect(reviewed.flow?.nodes[0]).toMatchObject({ label: "Edited click proposal", definitionId: "builtin.policy.action", parameterValues: { outputId: "click" } });

    const reapplied = await service.reviewRecordingFlowProposal({
      projectId: project.id,
      proposalId: proposal!.proposalId,
      decision: "approved",
      destination: { kind: "flow", flowId: reviewed.flow!.flowId },
      policyOverride: {
        schemaVersion: "0.1",
        version: "1.0.0",
        policyId: "policy.edited-recording-proposal",
        taskId: "task.edited-recording-proposal",
        sourceEvidence: [{ layer: "raw_recording", artifactId: recording.recordingId }],
        generatedMetadata: { generatedBy: "user", generatedAt: 3, confidence: 0.8 },
        nodes: [{
          id: "node.reapplied-click",
          label: "Reapplied click proposal",
          description: "Reapplied without regenerating.",
          eligibility: { type: "all", conditions: [] },
          actions: [{ id: "action.reapplied-click", actionType: "click", outputId: "click", parameters: { target: "submit" } }],
          successConditions: { type: "all", conditions: [] },
          failureConditions: { type: "none", conditions: [] },
          timeout: { timeoutMs: 5000 },
          retry: { maxAttempts: 1, backoffMs: 500 },
          recovery: { strategy: "pause" },
          outgoingEdges: [],
          sourceEvidence: [{ layer: "raw_recording", artifactId: recording.recordingId, entryId: "entry.1" }],
          generatedMetadata: { generatedBy: "user", generatedAt: 3, confidence: 0.8 }
        }],
        edges: []
      }
    });

    expect(reapplied.proposal.status).toBe("approved");
    expect(reapplied.flow?.flowId).toBe(reviewed.flow!.flowId);
    expect(reapplied.flow?.nodes[0]).toMatchObject({ label: "Reapplied click proposal", definitionId: "builtin.policy.action" });
  });

  it("explains mapper miss diagnostics when no recording Flow candidates are accepted", async () => {
    const io = new IoRegistry();
    io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId }) });
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "example.importer", packageVersion: "1.0.0", domainId: "example", nodes: [], recordingMappers: [{ id: "empty-mapper", version: "1.0.0", description: "Does not map this recording", outputIds: ["click"] }] };
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, { packageId: "example.importer", packageVersion: "1.0.0", implementations: {}, recordingMappers: { "empty-mapper": () => null } });
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
    const project = await service.createProject({ name: "Mapper Miss", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.mapper-miss", domainId: "example", startedAt: 100, initialState: { timestamp: 100, namespaces: {} } });
    await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "observation", observationType: "clicked", payload: { inputId: "clicked" }, timestamp: 200, monotonicOffsetMs: 100 } });

    const result = await service.createRecordingFlowProposals({ projectId: project.id, recordingId: recording.recordingId });

    expect(result.proposals).toEqual([]);
    expect(result.issues[0]).toContain("saw 1 entries (observation: 1), matched 0, emitted 0 raw candidates");
  });

  it("stores project recordings and normalized timelines in project folders", async () => {
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
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

    const reloaded = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
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
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
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
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
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

  it("stores client state snapshots as recording-scoped object refs and hydrates them when opened", async () => {
    await writeFile(path.join(tempRoot, "config.json"), JSON.stringify({ layoutVersion: 2 }), "utf8");
    const service = new AutomationStudioService({
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
    const service = new AutomationStudioService({
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
    const service = new AutomationStudioService({
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
    const service = new AutomationStudioService({
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
    const service = new AutomationStudioService({
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
    const service = new AutomationStudioService({
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
    const service = new AutomationStudioService({
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

  it("stores project artifacts and runtime sessions in project folders", async () => {
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Runtime Project" });
    const flow = await service.createDefaultFlow({ projectId: project.id, ownerKind: "routine", ownerId: "routine.runtime", name: "Runtime Flow" });
    const runnableFlow = {
      ...flow,
      nodes: [
        { id: "start", definitionId: "builtin.control.start", parameterValues: {} },
        { id: "constant", definitionId: "builtin.data.constant", parameterValues: { value: "ok" } },
        { id: "end", definitionId: "builtin.control.end", parameterValues: { status: "success" } }
      ],
      edges: [
        { id: "start.constant", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "constant", targetPortId: "in" },
        { id: "constant.end", sourceNodeId: "constant", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }
      ]
    };
    await service.saveProjectArtifact({ projectId: project.id, kind: "flow", artifact: runnableFlow });

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId });
    const reloaded = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
    const artifacts = await reloaded.listProjectArtifacts(project.id);
    const runs = await reloaded.listRuntimeSessions(project.id);

    expect(artifacts.flows).toHaveLength(1);
    expect(run.status).toBe("succeeded");
    expect(runs[0]).toMatchObject({ runId: run.runId, status: "succeeded" });

    const projectRoot = path.join(tempRoot, "programs", "automation-studio", "projects", project.id);
    await expect(readFile(path.join(projectRoot, "flows", flow.flowId, "flow.json"), "utf8")).resolves.toContain("\"flowId\"");
    await expect(readFile(path.join(projectRoot, "runtime", "indexes", "sessions.json"), "utf8")).resolves.toContain(run.runId);
  });

  it("deletes saved project artifacts and owned flow files from project folders", async () => {
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Deletion Project" });
    const now = Date.now();
    await service.saveProjectArtifact({
      projectId: project.id,
      kind: "task",
      artifact: {
        schemaVersion: "0.1",
        taskId: "task.delete-me",
        name: "Delete Me",
        policyFlowId: "task.task.delete-me.policy-flow",
        recordingIds: [],
        createdAt: now,
        updatedAt: now,
        metadata: {
          policyId: "policy.task.delete-me.saved"
        }
      }
    });
    await service.saveProjectArtifact({
      projectId: project.id,
      kind: "flow",
      artifact: {
        schemaVersion: "0.1",
        flowId: "task.task.delete-me.policy-flow",
        ownerKind: "task",
        ownerId: "task.delete-me",
        name: "Delete Me",
        nodes: [],
        edges: [],
        createdAt: now,
        updatedAt: now
      }
    });

    const projectRoot = path.join(tempRoot, "programs", "automation-studio", "projects", project.id);
    await expect(readFile(path.join(projectRoot, "tasks", "task.delete-me", "task.json"), "utf8")).resolves.toContain("\"taskId\"");
    await expect(readFile(path.join(projectRoot, "flows", "task.task.delete-me.policy-flow", "flow.json"), "utf8")).resolves.toContain("\"flowId\"");

    const deleted = await service.deleteProjectArtifact({ projectId: project.id, kind: "task", artifactId: "task.delete-me", deleteOwnedArtifacts: true });
    const artifacts = await service.listProjectArtifacts(project.id);

    expect(deleted.deletedArtifactIds).toEqual(expect.arrayContaining(["task:task.delete-me", "flow:task.task.delete-me.policy-flow", "policy:policy.task.delete-me.saved"]));
    expect(artifacts.tasks.map((item) => item.taskId)).not.toContain("task.delete-me");
    expect(artifacts.flows.map((item) => item.flowId)).not.toContain("task.task.delete-me.policy-flow");
    await expect(readFile(path.join(projectRoot, "tasks", "task.delete-me", "task.json"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(projectRoot, "flows", "task.task.delete-me.policy-flow", "flow.json"), "utf8")).rejects.toThrow();
  });

  it("persists recording pipeline artifacts through proposal approval and replay", async () => {
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Pipeline Project" });
    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.pipeline-test",
      taskId: "task.pipeline",
      startedAt: 100,
      initialState: { timestamp: 100, namespaces: {} }
    });
    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: { type: "action", actionType: "output.step-started", outputId: "output.step-started", parameters: { step: 1 }, origin: "operator", startedAt: 300, timestamp: 300 }
    });
    await service.appendRecordingMarkerEntry({ projectId: project.id, recordingId: recording.recordingId, label: "Goal", monotonicOffsetMs: 1000 });
    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: { type: "action", actionType: "output.step-completed", outputId: "output.step-completed", parameters: { step: 1 }, origin: "operator", startedAt: 1300, timestamp: 1300 }
    });
    await service.normalizeRecording({ projectId: project.id, recordingId: recording.recordingId });

    const review = await service.createNormalizationReview({ projectId: project.id, recordingId: recording.recordingId });
    const miningRun = await service.mineRecordingEvidence({ projectId: project.id, recordingId: recording.recordingId });
    const model = await service.learnTaskModel({ projectId: project.id, taskId: "task.pipeline", miningRunId: miningRun.miningRunId });
    const proposal = await service.proposePolicyFromModel({ projectId: project.id, learnedTaskModelId: model.learnedTaskModelId });
    const approved = await service.approvePolicyProposal({ projectId: project.id, proposalId: proposal.proposalId });
    const replay = await service.replayPolicyAgainstRecording({ projectId: project.id, recordingId: recording.recordingId, policyId: approved.policy.policyId });
    const artifacts = await service.listPipelineArtifacts(project.id);
    const approvedFlow = await service.getFlow(project.id, String(approved.metadata?.approvedFlowId));

    expect(review.waitClips[0]).toMatchObject({ waitMs: 800 });
    expect(proposal.patch).toMatchObject({ targetTaskId: "task.pipeline", mergeStrategy: "append_or_branch" });
    expect(artifacts.miningRuns.map((item) => item.miningRunId)).toContain(miningRun.miningRunId);
    expect(artifacts.evidenceFacts.length).toBeGreaterThan(0);
    expect(artifacts.evidenceObservations.length).toBeGreaterThan(0);
    expect(artifacts.evidenceClaims.length).toBeGreaterThan(0);
    expect(artifacts.learnedTaskModels.map((item) => item.learnedTaskModelId)).toContain(model.learnedTaskModelId);
    expect(artifacts.policyProposals[0]).toMatchObject({ proposalId: proposal.proposalId, status: "approved" });
    expect(replay.policyId).toBe(approved.policy.policyId);
    expect(approvedFlow).toMatchObject({ flowId: "flow.task.pipeline", origin: "recorded", metadata: { policyId: approved.policy.policyId } });
    expect(approvedFlow.nodes.length).toBe(approved.policy.nodes.length);

    const projectRoot = path.join(tempRoot, "programs", "automation-studio", "projects", project.id);
    await expect(readFile(path.join(projectRoot, "indexes", "pipeline.json"), "utf8")).resolves.toContain(proposal.proposalId);
    await expect(readFile(path.join(projectRoot, "recordings", "recording.pipeline-test", "derived", "index.json"), "utf8")).resolves.toContain(proposal.proposalId);
    await expect(readFile(path.join(projectRoot, "recordings", "recording.pipeline-test", "derived", "evidence", "claims", `${artifacts.evidenceClaims[0]!.claimId}.json`), "utf8")).resolves.toContain("\"claimId\"");
    await expect(readFile(path.join(projectRoot, "proposals", "recording.pipeline-test", proposal.proposalId, "proposal.json"), "utf8")).resolves.toContain("\"proposalId\"");
    await expect(readFile(path.join(projectRoot, "policies", `${approved.policy.policyId}.json`), "utf8")).resolves.toContain("\"policyId\"");
    await expect(readFile(path.join(projectRoot, "tasks", "task.pipeline", "task.json"), "utf8")).rejects.toThrow();

    await service.deleteRecording({ projectId: project.id, recordingId: recording.recordingId });
    await expect(readFile(path.join(projectRoot, "recordings", "recording.pipeline-test", "derived", "index.json"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(projectRoot, "proposals", "recording.pipeline-test", proposal.proposalId, "proposal.json"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(projectRoot, "recordings", "recording.pipeline-test", "derived", "evidence", "claims", `${artifacts.evidenceClaims[0]!.claimId}.json`), "utf8")).rejects.toThrow();
    expect((await service.listPipelineArtifacts(project.id)).policyProposals).toEqual([]);
  });

  it("proposes a task directly from recording-owned mined evidence", async () => {
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
    service.registerRecordingDomain({
      domainId: "example.direct",
      label: "Direct proposal domain",
      schemaVersion: "0.1",
      events: [{
        eventType: "step.completed",
        label: "Step completed",
        payloadSchema: { type: "object" },
        stateReducer: ({ event, previousState }) => ({
          state: {
            timestamp: event.timestamp ?? Date.now(),
            namespaces: {
              ...previousState.namespaces,
              task: {
                schemaId: "example.direct",
                schemaVersion: "0.1",
                values: {
                  status: stateValue("string", "completed", event.timestamp ?? Date.now())
                }
              }
            }
          }
        })
      }],
      statePaths: [{
        namespace: "task",
        path: "status",
        type: "string",
        elementKind: "status",
        label: "Task status",
        stableAcrossSessions: false
      }]
    });
    const project = await service.createProject({ name: "Direct Proposal Project" });
    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.direct-proposal",
      taskId: "task.direct",
      startedAt: 100,
      initialState: { timestamp: 100, namespaces: {} }
    });
    await service.appendRecordingDomainEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      domainId: "example.direct",
      eventType: "step.completed",
      timestamp: 300,
      payload: { step: 1 }
    });
    await service.normalizeRecording({ projectId: project.id, recordingId: recording.recordingId });
    const miningRun = await service.mineRecordingEvidence({ projectId: project.id, recordingId: recording.recordingId });

    await expect(service.proposePolicyFromModel({ projectId: project.id, recordingId: recording.recordingId })).rejects.toThrow(/No executable output-bound actions/);
    const projectArtifacts = await service.listProjectArtifacts(project.id);

    expect(miningRun.correlations?.[0]).toMatchObject({ statePath: "task.status", elementKind: "status", descriptor: { label: "Task status" } });
    expect(projectArtifacts.tasks).toEqual([]);
    expect(projectArtifacts.flows).toEqual([]);

    const projectRoot = path.join(tempRoot, "programs", "automation-studio", "projects", project.id);
    await expect(readFile(path.join(projectRoot, "recordings", "recording.direct-proposal", "derived", "evidence", "mining-runs", `${miningRun.miningRunId}.json`), "utf8")).resolves.toContain("\"miningRunId\"");
    await expect(readFile(path.join(projectRoot, "recordings", "recording.direct-proposal", "derived", "evidence", "facts", `${miningRun.evidenceFactIds![0]}.json`), "utf8")).resolves.toContain("\"factId\"");
    await expect(readFile(path.join(projectRoot, "recordings", "recording.direct-proposal", "derived", "evidence", "observations", `${miningRun.evidenceObservationIds![0]}.json`), "utf8")).resolves.toContain("\"observationId\"");
    await expect(readFile(path.join(projectRoot, "recordings", "recording.direct-proposal", "derived", "evidence", "correlations", `${miningRun.stateActionCorrelationIds![0]}.json`), "utf8")).resolves.toContain("\"correlationId\"");
    await expect(readFile(path.join(projectRoot, "recordings", "recording.direct-proposal", "derived", "evidence", "claims", `${miningRun.evidenceClaimIds![0]}.json`), "utf8")).resolves.toContain("\"claimId\"");
    await expect(readdir(path.join(projectRoot, "proposals", "recording.direct-proposal"))).rejects.toThrow();
  });

  it("turns state evidence around an output action into eligibility and success conditions", async () => {
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
    service.registerRecordingDomain({
      domainId: "example.state-evidence",
      label: "State evidence domain",
      schemaVersion: "0.1",
      events: [{
        eventType: "status.changed",
        label: "Status changed",
        payloadSchema: { type: "object" },
        stateReducer: ({ event, previousState }) => ({
          state: {
            timestamp: event.timestamp ?? Date.now(),
            namespaces: {
              ...previousState.namespaces,
              task: {
                schemaId: "example.state-evidence",
                schemaVersion: "0.1",
                values: {
                  status: stateValue("string", String(event.payload?.status ?? "unknown"), event.timestamp ?? Date.now())
                }
              }
            }
          }
        })
      }],
      statePaths: [{
        namespace: "task",
        path: "status",
        type: "string",
        elementKind: "status",
        label: "Task status"
      }]
    });
    const project = await service.createProject({ name: "State Evidence Project" });
    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.state-evidence",
      taskId: "task.state-evidence",
      startedAt: 100,
      initialState: { timestamp: 100, namespaces: {} }
    });
    await service.appendRecordingDomainEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      domainId: "example.state-evidence",
      eventType: "status.changed",
      timestamp: 150,
      payload: { status: "ready" }
    });
    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: { type: "action", actionType: "output.submit", outputId: "output.submit", parameters: {}, origin: "operator", startedAt: 200, timestamp: 200 }
    });
    await service.appendRecordingDomainEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      domainId: "example.state-evidence",
      eventType: "status.changed",
      timestamp: 250,
      payload: { status: "completed" }
    });
    await service.normalizeRecording({ projectId: project.id, recordingId: recording.recordingId });

    const miningRun = await service.mineRecordingEvidence({ projectId: project.id, recordingId: recording.recordingId });
    const proposal = await service.proposePolicyFromModel({ projectId: project.id, recordingId: recording.recordingId });
    const node = proposal.policy.nodes[0]!;

    expect(miningRun.conditionCandidates.some((candidate) => candidate.signalPath === "task.status" && candidate.metadata?.actionEntryId === "entry.3")).toBe(true);
    expect(miningRun.actionEffects.some((effect) => effect.actionOccurrenceId === "entry.3" && effect.signalPath === "task.status")).toBe(true);
    expect(node.eligibility.conditions.length).toBeGreaterThan(0);
    expect(node.successConditions.conditions.length).toBeGreaterThan(0);
    expect(node.sourceEvidence.some((item) => item.layer === "state_action_correlation")).toBe(true);
  });

  it("merges proposals from multiple recordings into one canonical Flow", async () => {
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Branching Proposal Project" });
    for (const [recordingId, secondStep] of [["recording.branch-a", "branch.a"], ["recording.branch-b", "branch.b"]] as const) {
      const recording = await service.createRecording({
        projectId: project.id,
        recordingId,
        taskId: "task.branching",
        startedAt: 100,
        initialState: { timestamp: 100, namespaces: {} }
      });
      await service.appendRecordingEvent({
        projectId: project.id,
        recordingId: recording.recordingId,
        entry: { type: "action", actionType: "output.shared-start", outputId: "output.shared-start", parameters: {}, origin: "operator", startedAt: 200, timestamp: 200 }
      });
      await service.appendRecordingEvent({
        projectId: project.id,
        recordingId: recording.recordingId,
        entry: { type: "action", actionType: `output.${secondStep}`, outputId: `output.${secondStep}`, parameters: {}, origin: "operator", startedAt: 300, timestamp: 300 }
      });
      await service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId, endedAt: 400 });
      const processed = await service.processFinalizedRecording({ projectId: project.id, recordingId: recording.recordingId });
      expect(processed.proposal?.patch?.nodes.length).toBe(2);
      await service.approvePolicyProposal({ projectId: project.id, proposalId: processed.proposal!.proposalId });
    }

    const flow = await service.getFlow(project.id, "flow.task.branching");

    expect((flow.metadata?.sourceRecordingIds as string[]).sort()).toEqual(["recording.branch-a", "recording.branch-b"]);
    expect(flow.nodes.map((node) => node.parameterValues?.outputId)).toEqual(expect.arrayContaining(["output.shared-start", "output.branch.a", "output.branch.b"]));
    expect(flow.nodes.length).toBeGreaterThanOrEqual(3);
    expect(flow.edges.some((edge) => edge.label === "Recorded branch")).toBe(true);
  });

  it("applies edited proposal overrides exactly instead of preserving deleted nodes", async () => {
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Edited Proposal Project" });
    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.edited-proposal",
      taskId: "task.edited-proposal",
      startedAt: 100,
      initialState: { timestamp: 100, namespaces: {} }
    });
    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: { type: "action", actionType: "output.step-one", outputId: "output.step-one", parameters: { step: 1 }, origin: "operator", startedAt: 200, timestamp: 200 }
    });
    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: { type: "action", actionType: "output.step-two", outputId: "output.step-two", parameters: { step: 2 }, origin: "operator", startedAt: 300, timestamp: 300 }
    });
    await service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId, endedAt: 400 });
    const processed = await service.processFinalizedRecording({ projectId: project.id, recordingId: recording.recordingId });
    const proposal = processed.proposal!;
    const approved = await service.approvePolicyProposal({ projectId: project.id, proposalId: proposal.proposalId });
    expect(approved.policy.nodes.length).toBeGreaterThan(1);
    const existingFlow = await service.getFlow(project.id, "flow.task.edited-proposal");
    await service.saveFlow({ projectId: project.id, flow: { ...existingFlow, name: "Edited Proposal Flow" } });

    const override = {
      ...proposal.policy,
      policyId: approved.policy.policyId,
      taskId: "task.edited-proposal",
      nodes: [],
      edges: []
    };
    const edited = await service.approvePolicyProposal({
      projectId: project.id,
      proposalId: proposal.proposalId,
      targetFlowId: "flow.task.edited-proposal",
      requireExistingFlow: true,
      policyOverride: override
    });
    const flow = await service.getFlow(project.id, "flow.task.edited-proposal");

    expect(edited.policy.nodes).toEqual([]);
    expect(edited.policy.edges).toEqual([]);
    expect(flow.name).toBe("Edited Proposal Flow");
    expect(flow.nodes).toEqual([]);
    expect(flow.edges).toEqual([]);
  });

  it("proposes a task from sparse mined action evidence without state correlations", async () => {
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Sparse Proposal Project" });
    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.sparse-proposal",
      taskId: "task.sparse",
      startedAt: 100,
      initialState: { timestamp: 100, namespaces: {} }
    });
    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: { type: "action", actionType: "output.first", outputId: "output.first", parameters: { step: 1 }, origin: "operator", startedAt: 200, timestamp: 200 }
    });
    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: { type: "action", actionType: "output.second", outputId: "output.second", parameters: { step: 2 }, origin: "operator", startedAt: 300, timestamp: 300 }
    });
    await service.normalizeRecording({ projectId: project.id, recordingId: recording.recordingId });
    const miningRun = await service.mineRecordingEvidence({ projectId: project.id, recordingId: recording.recordingId });

    const proposal = await service.proposePolicyFromModel({ projectId: project.id, recordingId: recording.recordingId });

    expect(miningRun.correlations).toEqual([]);
    expect(proposal.metadata).toMatchObject({ source: "mined_evidence", recordingId: recording.recordingId, miningRunId: miningRun.miningRunId });
    expect(proposal.policy.nodes.length).toBeGreaterThan(0);
    expect(proposal.policy.nodes[0]?.sourceEvidence[0]?.layer).toBe("evidence_observation");
  });

  it("processes finalized recordings into current task proposals", async () => {
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Finalized Processing Project" });
    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.process-finalized",
      taskId: "task.process-finalized",
      startedAt: 100,
      initialState: { timestamp: 100, namespaces: {} }
    });
    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: { type: "domain_event", eventType: "step.one", timestamp: 200, payload: { step: 1 } }
    });
    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: { type: "domain_event", eventType: "step.two", timestamp: 300, payload: { step: 2 } }
    });
    await service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId, endedAt: 400 });

    const processed = await service.processFinalizedRecording({ projectId: project.id, recordingId: recording.recordingId });
    const skipped = await service.processFinalizedRecording({ projectId: project.id, recordingId: recording.recordingId });

    expect(processed.status).toBe("partial");
    expect(processed.normalizedTimeline?.recordingId).toBe(recording.recordingId);
    expect(processed.miningRun?.metadata).toMatchObject({ recordingId: recording.recordingId });
    expect(processed.proposal).toBeUndefined();
    expect(processed.issues).toEqual(expect.arrayContaining([expect.stringMatching(/No executable output-bound actions/)]));
    await expect(service.listProjectArtifacts(project.id)).resolves.toMatchObject({ tasks: [], flows: [] });
    expect(skipped.status).toBe("partial");
    expect(skipped.proposal).toBeUndefined();
  });

  it("keeps finalized recording proposals stable and persisted", async () => {
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Stable Proposal Project" });
    const recording = await service.createRecording({
      projectId: project.id,
      recordingId: "recording.stable-proposal",
      taskId: "task.stable-proposal",
      startedAt: 100,
      initialState: { timestamp: 100, namespaces: {} }
    });
    await service.appendRecordingEvent({
      projectId: project.id,
      recordingId: recording.recordingId,
      entry: { type: "domain_event", eventType: "step.one", timestamp: 200, payload: { step: 1 } }
    });
    await service.finalizeRecording({ projectId: project.id, recordingId: recording.recordingId, endedAt: 300 });

    const first = await service.processFinalizedRecording({ projectId: project.id, recordingId: recording.recordingId });
    await expect(service.proposePolicyFromModel({ projectId: project.id, recordingId: recording.recordingId })).rejects.toThrow(/No executable output-bound actions/);
    const artifacts = await service.listPipelineArtifacts(project.id);
    const projectRoot = path.join(tempRoot, "programs", "automation-studio", "projects", project.id);

    expect(first.status).toBe("partial");
    expect(first.proposal).toBeUndefined();
    expect(artifacts.policyProposals.filter((proposal) => proposal.metadata?.recordingId === recording.recordingId)).toEqual([]);
    await expect(readdir(path.join(projectRoot, "proposals", recording.recordingId))).rejects.toThrow();

    await service.deleteRecording({ projectId: project.id, recordingId: recording.recordingId });
    expect((await service.listPipelineArtifacts(project.id)).policyProposals.filter((proposal) => proposal.metadata?.recordingId === recording.recordingId)).toEqual([]);
    await expect(readdir(path.join(projectRoot, "proposals", recording.recordingId))).rejects.toThrow();
  });

  it("accepts only registered domain recording events and records derived state", async () => {
    const service = new AutomationStudioService({ seedFixture: false });
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

describe("AutomationStudioService canonical Flow persistence", () => {
  beforeEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("persists new canonical Flows in project files with project scope enforcement", async () => {
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
    const domainProject = await service.createProject({ name: "Orders", domainId: "orders" });
    const globalProject = await service.createProject({ name: "Global" });
    const flow = await service.createFlow({ projectId: domainProject.id, flowId: "flow.orders.submit", name: "Submit order" });
    await expect(service.createFlow({ projectId: domainProject.id, flowId: flow.flowId, name: "Accidental overwrite" })).rejects.toThrow("already exists");

    expect(flow.scope).toEqual({ kind: "domain", domainId: "orders" });
    await expect(service.saveFlow({ projectId: globalProject.id, flow: { ...flow, projectId: globalProject.id } })).rejects.toThrow("scope");
    const published = await service.publishFlow({ projectId: domainProject.id, flowId: flow.flowId, version: "1.0.0", flowDigest: "sha256:submit-order" });
    expect(published).toMatchObject({ visibility: "public", publication: { status: "published", version: "1.0.0" } });
    await expect(service.listFlowPublications(domainProject.id, flow.flowId)).resolves.toMatchObject([{ flowId: flow.flowId, version: "1.0.0", status: "published" }]);
    await expect(service.saveFlow({ projectId: domainProject.id, flow: { ...published, publicationHistory: [] } })).rejects.toThrow("publication history is immutable");
    await expect(service.saveFlow({ projectId: domainProject.id, flow: { ...published, publication: { status: "draft" } } })).rejects.toThrow("snapshot metadata is immutable");

    const reloaded = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
    const entries = await reloaded.listFlows(domainProject.id);
    expect(entries.find((entry) => entry.source === "canonical")?.flow).toMatchObject({ flowId: flow.flowId, projectId: domainProject.id });
    await expect(reloaded.deprecateFlowPublication({ projectId: domainProject.id, flowId: flow.flowId, version: "1.0.0", reason: "Use 2.0.0" })).resolves.toMatchObject({ status: "deprecated", deprecationReason: "Use 2.0.0" });
    await expect(reloaded.listPublishedFlowNodes(domainProject.id)).resolves.toEqual([]);
    await expect(reloaded.getFlow(globalProject.id, flow.flowId)).rejects.toThrow("Unknown Automation Studio Flow");
  });

  it("runs the selected canonical Flow with its compiled region plan", async () => {
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Canonical runtime" });
    const blank = await service.createFlow({ projectId: project.id, flowId: "flow.canonical.runtime", name: "Canonical runtime" });
    await service.saveFlow({ projectId: project.id, flow: {
      ...blank,
      nodes: [{ id: "start", definitionId: "builtin.control.start" }, { id: "value", definitionId: "builtin.data.constant", parameterValues: { value: "canonical" } }],
      edges: [{ id: "start.value", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "value", targetPortId: "in" }],
      regions: [{ id: "deterministic", name: "Deterministic", kind: "deterministic", nodeIds: ["start", "value"], entryPorts: [], exitPorts: [] }]
    } });

    const run = await service.runRuntimeSession({ projectId: project.id, flowId: blank.flowId });
    expect(run).toMatchObject({ status: "succeeded", targetKind: "flow", flowId: blank.flowId, metadata: { canonicalFlow: true } });
    expect(run.trace?.attempts.map((attempt) => attempt.regionId)).toEqual(["deterministic", "deterministic"]);
    expect(run.trace?.values.value).toBe("canonical");
  });

  it("requires an explicit per-run grant for global-to-domain Call Flow execution", async () => {
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false }).bindIoRuntime(new IoRegistry(), "orders");
    const domainProject = await service.createProject({ name: "Orders", domainId: "orders" });
    const globalProject = await service.createProject({ name: "Global orchestrator" });
    const child = await service.createFlow({ projectId: domainProject.id, flowId: "flow.orders.child", name: "Orders child" });
    await service.saveFlow({ projectId: domainProject.id, flow: { ...child, nodes: [{ id: "start", definitionId: "builtin.control.start" }, { id: "end", definitionId: "builtin.control.end" }], edges: [{ id: "start.end", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "end", targetPortId: "in" }] } });
    const publishedChild = await service.publishFlow({ projectId: domainProject.id, flowId: child.flowId, version: "1.0.0" });
    expect((publishedChild.publication as any).snapshot.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ definitionId: "builtin.control.start", definitionVersion: "1.0.0" })]));
    const parent = await service.createFlow({ projectId: globalProject.id, flowId: "flow.global.parent", name: "Global parent" });
    await service.saveFlow({ projectId: globalProject.id, flow: { ...parent, executionDefaults: { authorizedDomainIds: ["orders"] }, nodes: [{ id: "start", definitionId: "builtin.control.start" }, createCallFlowNode({ id: "call", target: { flowId: child.flowId, version: "1.0.0", scope: { kind: "domain", domainId: "orders" } } })], edges: [{ id: "start.call", sourceNodeId: "start", sourcePortId: "success", targetNodeId: "call", targetPortId: "in" }] } });
    expect((await service.inspectFlowDependencies(domainProject.id, child.flowId)).usedBy).toEqual([]);
    await expect(service.runRuntimeSession({ projectId: globalProject.id, flowId: parent.flowId })).resolves.toMatchObject({ status: "failed", trace: { message: expect.stringContaining("cross_scope_call_not_authorized") } });
    const granted = await service.runRuntimeSession({ projectId: globalProject.id, flowId: parent.flowId, authorizedDomainIds: ["orders"] });
    expect(granted).toMatchObject({
      status: "succeeded",
      trace: {
        attempts: expect.arrayContaining([
          expect.objectContaining({
            nodeId: "call",
            compositeTarget: {
              flowId: child.flowId,
              version: "1.0.0",
              flowDigest: (publishedChild.publication as any).flowDigest
            }
          })
        ])
      }
    });
  });

  it("converts source ownership explicitly and rejects uncompiled code-owned edits", async () => {
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Source ownership" });
    const blank = await service.createFlow({ projectId: project.id, flowId: "flow.source", name: "Source" });
    const generatedSourcePath = path.join(tempRoot, "programs", "automation-studio", "projects", project.id, "flows", "flow.source", "source", "flows", "flow.source.flow.ts");
    await expect(readFile(generatedSourcePath, "utf8")).resolves.toContain('flowId": "flow.source"');
    expect(blank.metadata).toMatchObject({ generatedSource: { moduleId: "flows/flow.source.flow.ts", relativePath: "flows/flow.source/source/flows/flow.source.flow.ts", authoritative: false } });
    await expect(service.getProjectArtifact(project.id, "config", "flow.flow.source.config")).resolves.toMatchObject({
      configId: "flow.flow.source.config",
      metadata: { generated: true, ownerKind: "flow", flowId: "flow.source" },
      values: { flowId: "flow.source", name: "Source", source: { mode: "visual" } }
    });
    const visual = await service.saveFlow({ projectId: project.id, flow: { ...blank, nodes: [{ id: "value", definitionId: "builtin.data.constant", parameterValues: { value: "ok" } }] } });
    await expect(service.getProjectArtifact(project.id, "config", "flow.flow.source.config")).resolves.toMatchObject({
      values: { flowId: "flow.source", source: { mode: "visual" } }
    });
    const converted = await service.compileAndSaveFlowSource({ projectId: project.id, flowId: visual.flowId, moduleId: "flows/source.flow.ts", sourceText: generateFlowTypeScript(visual) });
    expect(converted.compilation.ok).toBe(true);
    expect(converted.flow?.source).toMatchObject({ mode: "code", moduleId: "flows/source.flow.ts", compilerVersion: "0.1" });
    await expect(readFile(path.join(tempRoot, "programs", "automation-studio", "projects", project.id, "flows", "flow.source", "source", "flows", "source.flow.ts"), "utf8")).resolves.toContain('flowId": "flow.source"');
    await expect(service.getProjectArtifact(project.id, "config", "flow.flow.source.config")).resolves.toMatchObject({
      values: { flowId: "flow.source", source: { mode: "code", moduleId: "flows/source.flow.ts" } }
    });
    await expect(service.saveFlow({ projectId: project.id, flow: { ...converted.flow!, nodes: [...converted.flow!.nodes, { id: "tampered", definitionId: "builtin.control.end" }] } })).rejects.toThrow("compiler digest");
    await expect(service.saveFlow({ projectId: project.id, flow: { ...converted.flow!, source: { mode: "visual" } } })).rejects.toThrow("explicit conversion");
    await expect(service.convertFlowToVisual({ projectId: project.id, flowId: visual.flowId })).resolves.toMatchObject({ source: { mode: "visual" }, publication: { status: "draft" } });
    await expect(service.getProjectArtifact(project.id, "config", "flow.flow.source.config")).resolves.toMatchObject({
      values: { flowId: "flow.source", source: { mode: "visual" } }
    });
    await expect(service.deleteFlow({ projectId: project.id, flowId: visual.flowId })).resolves.toMatchObject({ deletedFlowId: visual.flowId });
    await expect(service.getProjectArtifact(project.id, "config", "flow.flow.source.config")).rejects.toThrow("Unknown Automation Studio config");
  });

  it("exposes and executes explicitly bound domain-native nodes only in their project scope", async () => {
    const definition = { schemaVersion: "0.1" as const, id: "orders.total", version: "1.0.0", label: "Order total", description: "Calculates total", category: "Orders", source: { kind: "importer" as const, domainId: "orders", packageId: "orders.package", implementationKey: "total" }, availability: { kind: "domain" as const, domainId: "orders" }, capabilities: { executable: true as const }, inputs: [], outputs: [{ id: "total", label: "Total", valueType: "number" as const }], parameters: [] };
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "orders.package", packageVersion: "1.0.0", domainId: "orders", nodes: [definition] };
    const native = new AutomationStudioNativeNodeRuntime().register(manifest, { packageId: "orders.package", packageVersion: "1.0.0", implementations: { total: () => ({ outputs: { total: 42 } }) } });
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false }).bindNativeNodeRuntime(native);
    const domainProject = await service.createProject({ name: "Orders", domainId: "orders" }); const globalProject = await service.createProject({ name: "Global" });
    expect(await service.listNativeNodeDefinitions(domainProject.id)).toMatchObject([{ id: "orders.total" }]); expect(await service.listNativeNodeDefinitions(globalProject.id)).toEqual([]);
    const blank = await service.createFlow({ projectId: domainProject.id, flowId: "flow.orders.native", name: "Native" });
    await service.saveFlow({ projectId: domainProject.id, flow: { ...blank, nodes: [{ id: "total", definitionId: "orders.total" }] } });
    await expect(service.runRuntimeSession({ projectId: domainProject.id, flowId: blank.flowId })).resolves.toMatchObject({ status: "succeeded", trace: { values: { total: 42 } } });
  });

  it("inspects and applies non-destructive legacy Flow migration idempotently", async () => {
    const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
    const project = await service.createProject({ name: "Migration" });
    await service.saveProjectArtifact({
      projectId: project.id,
      kind: "task",
      artifact: {
        schemaVersion: "0.1",
        taskId: "task.legacy",
        name: "Legacy task",
        recordingIds: [],
        createdAt: 100,
        updatedAt: 100
      }
    });

    const inspection = await service.inspectFlowMigration(project.id);
    expect(inspection).toMatchObject({ migrationNeeded: true, outcomes: [{ legacyKind: "task", status: "created" }] });
    const migration = await service.migrateFlows(project.id);
    expect(migration.status).toBe("completed");
    expect(migration.outcomes[0]).toMatchObject({ status: "created" });
    await expect(service.listProjectArtifacts(project.id)).resolves.toMatchObject({ tasks: [{ taskId: "task.legacy" }] });

    const backup = await service.exportLegacyProject(project.id);
    expect(backup).toMatchObject({ backupId: migration.backupId, artifacts: { tasks: [{ taskId: "task.legacy" }] } });
    await service.verifyLegacyBackup(project.id, backup.backupId);
    await service.recordLegacyRetirementEvidence({ projectId: project.id, importerCoverageAcknowledged: true, importerEvidence: [{ packageId: "example.importer", packageVersion: "1.0.0", status: "validated" }] });
    await expect(service.inspectLegacyRetirement(project.id)).resolves.toMatchObject({ canLockWrites: true, unmigrated: [] });

    const rollbackPlan = await service.planFlowMigrationRollback(project.id, migration.migrationId);
    expect(rollbackPlan.status).toBe("ready");
    await expect(service.rollbackFlowMigration(project.id, migration.migrationId)).resolves.toMatchObject({ status: "applied" });
    await expect(service.rollbackFlowMigration(project.id, migration.migrationId)).resolves.toMatchObject({ status: "applied", flowIds: [] });
    await expect(service.listProjectArtifacts(project.id)).resolves.toMatchObject({ tasks: [{ taskId: "task.legacy" }] });
    expect((await service.inspectFlowMigration(project.id)).migrationNeeded).toBe(true);
    const remigration = await service.migrateFlows(project.id);
    const remigratedFlow = await service.getFlow(project.id, remigration.outcomes[0]!.flowId);
    await service.saveFlow({ projectId: project.id, flow: { ...remigratedFlow, name: "Operator edited migrated Flow" } });
    await expect(service.planFlowMigrationRollback(project.id, remigration.migrationId)).resolves.toMatchObject({ status: "blocked", blockers: [expect.stringContaining("changed after migration")] });

    const secondInspection = await service.inspectFlowMigration(project.id);
    expect(secondInspection).toMatchObject({ migrationNeeded: false, outcomes: [{ status: "already_migrated" }] });
    const secondMigration = await service.migrateFlows(project.id);
    expect(secondMigration.outcomes[0]).toMatchObject({ status: "already_migrated" });

    const sealed = await service.sealLegacyWrites({ projectId: project.id, expectedSchemaVersion: "0.2" });
    expect(sealed).toMatchObject({ state: { phase: "write_locked", projectSchemaVersion: "0.2" }, diagnostic: { code: "legacy.write_locked" } });
    await expect(service.saveProjectArtifact({ projectId: project.id, kind: "task", artifact: { taskId: "task.blocked", name: "Blocked", recordingIds: [] } })).rejects.toMatchObject({ code: "legacy.write_locked" });
    await expect(service.saveProjectArtifact({ projectId: project.id, kind: "flow", artifact: { flowId: "task.blocked.flow", ownerKind: "task", ownerId: "task.blocked", name: "Blocked" } })).rejects.toMatchObject({ code: "legacy.write_locked" });
    await expect(service.saveProjectArtifact({ projectId: project.id, kind: "config", artifact: { configId: "config.allowed", name: "Allowed" } })).resolves.toMatchObject({ configId: "config.allowed" });
    await expect(service.getProjectArtifact(project.id, "task", "task.legacy")).resolves.toMatchObject({ taskId: "task.legacy" });
    expect((await service.listLegacyRetirementAudit(project.id)).map((event) => event.type)).toEqual(expect.arrayContaining(["backup_created", "backup_verified", "migration_applied", "rollback_applied", "writes_locked"]));
  });
});
