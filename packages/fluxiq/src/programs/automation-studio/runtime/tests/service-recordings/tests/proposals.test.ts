import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stateValue } from "../../../../model/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { type AutomationStudioImporterSdkManifest } from "../../../../nodes/index.ts";
import { IoRegistry, createEnvelope } from "../../../../../../io/index.ts";
import type { JsonObject } from "../../../../../../core/index.ts";
import { getPrimarySubflowGraph } from "../../service-fixtures.ts";

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

  it("normalizes mapper element targets in recording Flow proposals, taking identity from a recorded element and never from typed text", async () => {
    let parameters: JsonObject = {};
    const io = new IoRegistry();
    io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId }) });
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "example.importer", packageVersion: "1.0.0", domainId: "example", nodes: [], recordingMappers: [{ id: "click-mapper", version: "1.0.0", description: "Maps clicks", outputIds: ["click"] }] };
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, { packageId: "example.importer", packageVersion: "1.0.0", implementations: {}, recordingMappers: { "click-mapper": () => ({ outputId: "click", parameters, confidence: 0.9 }) } });
    const service = createService({ dataDir: tempRoot }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
    const project = await service.createProject({ name: "Mapped element target", domainId: "example" });
    const element = { tagName: "input", implicitRole: "textbox", accessibleName: "Display name", id: "display-name" };
    const identity = { tagName: "input", role: "textbox", accessibleName: "Display name", id: "display-name" };
    const cases: Array<[string, JsonObject, JsonObject]> = [
      ["explicit target", { target: { selector: "button[data-testid='save']", visibleText: "Save", testId: "save" } }, { selector: "button[data-testid='save']", visibleText: "Save", testId: "save" }],
      ["typed text beside an element", { selector: "#display-name", statePath: "web.elements.display.name", text: "Ada Lovelace", element }, { selector: "#display-name", statePath: "web.elements.display.name", ...identity }],
      ["bare locator target beside an element", { target: { selector: "#display-name" }, text: "Ada Lovelace", element }, { selector: "#display-name", ...identity }]
    ];
    for (const [index, [label, recorded, fingerprint]] of cases.entries()) {
      parameters = recorded;
      const recording = await service.createRecording({ projectId: project.id, recordingId: `recording.mapper-element-target.${index}`, domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
      await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "observation", observationType: "clicked", payload: {}, timestamp: 2 } });
      const { proposals: [proposal] } = await service.createRecordingFlowProposals({ projectId: project.id, recordingId: recording.recordingId });
      const target = proposal?.candidates[0]?.parameters.target;
      expect(target, label).toMatchObject({ kind: "element", source: "mapper", fingerprint });
      expect(JSON.stringify(target), label).not.toContain("Ada Lovelace");
    }
  });

  it("turns mapped observations into reviewed Flow actions without making action inputs policy state", async () => {
    const io = new IoRegistry();
    let dispatches = 0;
    io.registerInput("example", { definition: { id: "clicked", title: "Clicked", role: "action", outputId: "click" }, mode: "stream", subscribe: (handler) => { queueMicrotask(() => handler(createEnvelope({ domainId: "example", ioId: "clicked", payload: { ok: true } }))); return () => undefined; } });
    io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => { dispatches += 1; return { ok: true, domainId: "example", outputId: request.outputId, payload: { done: true } }; } });
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "example.importer", packageVersion: "1.0.0", domainId: "example", nodes: [], recordingMappers: [{ id: "click-mapper", version: "1.0.0", description: "Maps recorded clicks", outputIds: ["click"] }] };
    let mapperSawElementMatcher = false;
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, { packageId: "example.importer", packageVersion: "1.0.0", implementations: {}, recordingMappers: { "click-mapper": (observation, context) => { mapperSawElementMatcher = typeof context.elementMatcher.bestCandidate === "function"; return observation.type === "observation" ? { outputId: "click", parameters: { target: "submit" }, sourceInputIds: ["clicked"], expectedConfirmation: { inputId: "clicked", timeoutMs: 100 }, confidence: 0.9 } : null; } } });
    const service = createService({ dataDir: tempRoot }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
    const project = await service.createProject({ name: "Mapped recording", domainId: "example" });
    const recording = await service.createRecording({ projectId: project.id, recordingId: "recording.mapped", domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
    await service.appendRecordingEvent({ projectId: project.id, recordingId: recording.recordingId, entry: { type: "observation", observationType: "clicked", payload: { inputId: "clicked" } } });
    const { proposals: [proposal], issues } = await service.createRecordingFlowProposals({ projectId: project.id, recordingId: recording.recordingId });
    expect(issues).toEqual([expect.stringContaining("recording.mapped has not been finalized")]);
    expect(mapperSawElementMatcher).toBe(true);
    expect(proposal?.candidates[0]).toMatchObject({ actionEntryId: proposal?.candidates[0]?.sourceObservationIds[0], outputId: "click", sourceInputIds: ["clicked"], policyStateEligible: false, expectedConfirmation: { inputId: "clicked" } });
    expect(proposal?.candidates[0]?.evidence).toEqual([{ layer: "recording", artifactId: recording.recordingId, entryId: proposal?.candidates[0]?.sourceObservationIds[0] }]);
    expect(proposal?.review).toBeUndefined();
    const reviewed = await service.reviewRecordingFlowProposal({
      projectId: project.id,
      proposalId: proposal!.proposalId,
      decision: "approved",
      destination: { kind: "flow", name: "Approved clicks" }
    });
    const reviewedGraph = await getPrimarySubflowGraph(service, project.id, reviewed.flow!.flowId);
    expect(reviewed.flow?.nodes).toEqual([]);
    expect(reviewedGraph.nodes[0]).toMatchObject({ definitionId: "builtin.policy.action", parameterValues: { outputId: "click", confirmationInputId: "clicked" }, metadata: { actionEntryId: proposal?.candidates[0]?.actionEntryId, timelineEntryId: proposal?.candidates[0]?.actionEntryId, rawEvidenceImmutable: true } });

    const routedFlow = await service.createFlow({ projectId: project.id, flowId: "flow.routed-recording-proposal", name: "Routed recording proposal" });
    const routedFallback = await service.createFlowSubflow({ projectId: project.id, flowId: routedFlow.flowId, name: "Browser work", role: "utility" });
    await service.setFlowMapFallback({ projectId: project.id, flowId: routedFlow.flowId, kind: "subflow", targetSubflowId: routedFallback.subflowId });
    const { proposals: [routedProposal] } = await service.createRecordingFlowProposals({ projectId: project.id, recordingId: recording.recordingId, force: true });
    await service.reviewRecordingFlowProposal({
      projectId: project.id,
      proposalId: routedProposal!.proposalId,
      decision: "approved",
      destination: { kind: "flow", flowId: routedFlow.flowId, writeMode: "replace_recording_derived" }
    });
    const routedSubflows = await service.listFlowSubflowSummaries({ projectId: project.id, flowId: routedFlow.flowId });
    expect(routedSubflows.subflows.map((item) => item.subflowId)).toEqual([routedFallback.subflowId]);
    expect((await service.getFlow(project.id, routedFallback.graphFlowId!)).nodes).toHaveLength(1);
    const indexedBeforeReplacement = await service.getFlowGraphViewport({ projectId: project.id, flowId: reviewedGraph.flowId, bounds: { minX: -10_000, minY: -10_000, maxX: 10_000, maxY: 10_000 }, limit: 100 });
    expect(indexedBeforeReplacement.page.nodes.map((node) => node.nodeId)).toEqual([reviewedGraph.nodes[0]!.id]);
    const { proposals: [replacementProposal] } = await service.createRecordingFlowProposals({ projectId: project.id, recordingId: recording.recordingId, force: true });
    const replaced = await service.reviewRecordingFlowProposal({
      projectId: project.id,
      proposalId: replacementProposal!.proposalId,
      decision: "approved",
      destination: { kind: "flow", flowId: reviewed.flow!.flowId, writeMode: "replace_recording_derived" }
    });
    const replacementGraph = await getPrimarySubflowGraph(service, project.id, reviewed.flow!.flowId);
    expect(replaced.proposal.review?.destination).toMatchObject({ kind: "flow", flowId: reviewed.flow!.flowId, writeMode: "replace_recording_derived" });
    expect(replacementGraph.nodes).toHaveLength(1);
    const indexedAfterReplacement = await service.getFlowGraphViewport({ projectId: project.id, flowId: replacementGraph.flowId, bounds: { minX: -10_000, minY: -10_000, maxX: 10_000, maxY: 10_000 }, limit: 100 });
    expect(indexedAfterReplacement.page.nodes.map((node) => node.nodeId)).toEqual([replacementGraph.nodes[0]!.id]);
    const savedEdit = await service.saveFlow({ projectId: project.id, flow: { ...replacementGraph, nodes: replacementGraph.nodes.map((node) => ({ ...node, label: "Edited click", metadata: { ...(node.metadata ?? {}), sourceObservationIds: ["forged"] } })) } });
    expect(savedEdit.nodes[0]).toMatchObject({ label: "Edited click", metadata: { sourceObservationIds: proposal!.candidates[0]!.sourceObservationIds, manualProvenance: [{ changedFields: ["label"] }] } });
    const { proposals: [unsafeReplacement] } = await service.createRecordingFlowProposals({ projectId: project.id, recordingId: recording.recordingId, force: true });
    await expect(service.reviewRecordingFlowProposal({
      projectId: project.id,
      proposalId: unsafeReplacement!.proposalId,
      decision: "approved",
      destination: { kind: "flow", flowId: reviewed.flow!.flowId, writeMode: "replace_recording_derived" }
    })).rejects.toThrow("entirely unedited recording-derived behavior");
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
    const invalidated = (await service.listPipelineArtifacts(project.id, { revalidateRecordingFlowProposals: true })).recordingFlowProposals.find((item) => item.proposalId === replacementProposal!.proposalId);
    expect(invalidated).toMatchObject({ status: "invalidated", invalidation: { affectedFlowIds: [reviewed.flow!.flowId] } });
  });

  it("generates multiple proposal attempts and deletes one without deleting the recording", async () => {
    const io = new IoRegistry();
    io.registerInput("example", { definition: { id: "clicked", title: "Clicked", role: "action", outputId: "click" }, mode: "stream", subscribe: (handler) => { queueMicrotask(() => handler(createEnvelope({ domainId: "example", ioId: "clicked", payload: { ok: true } }))); return () => undefined; } });
    io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId }) });
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "example.importer", packageVersion: "1.0.0", domainId: "example", nodes: [], recordingMappers: [{ id: "click-mapper", version: "1.0.0", description: "Maps clicks", outputIds: ["click"] }] };
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, { packageId: "example.importer", packageVersion: "1.0.0", implementations: {}, recordingMappers: { "click-mapper": () => ({ outputId: "click", parameters: { target: "submit" }, sourceObservationIds: ["entry.shared-state"], confidence: 0.9 }) } });
    const service = createService({ dataDir: tempRoot }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
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
    expect(second.recordingFlowProposals![0]!.metadata).toMatchObject({
      generationMode: "direct",
      requestedGenerationMode: "llm_assisted",
      llmAssistanceStatus: "not_invoked",
      generatedBy: "recording_mapper",
      title: "Clean checkout",
      instructions: "Prefer one reusable click action."
    });
    expect(second.recordingFlowProposals![0]!.metadata).not.toHaveProperty("llm");
    expect((await service.listPipelineArtifacts(project.id)).recordingFlowProposals.map((proposal) => proposal.proposalId)).toEqual(expect.arrayContaining([firstProposalId, secondProposalId]));

    await service.deleteProposal({ projectId: project.id, proposalId: firstProposalId });

    const artifacts = await service.listPipelineArtifacts(project.id);
    expect(artifacts.recordingFlowProposals.map((proposal) => proposal.proposalId)).toContain(secondProposalId);
    expect(artifacts.recordingFlowProposals.map((proposal) => proposal.proposalId)).not.toContain(firstProposalId);
    await expect(service.getRecordingSession(recording.recordingId, project.id)).resolves.toMatchObject({ recordingId: recording.recordingId });
  }, 15_000);

  it("ignores stale object-backed proposal artifacts during proposal refresh", async () => {
    const io = new IoRegistry();
    io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId }) });
    const manifest: AutomationStudioImporterSdkManifest = { schemaVersion: "0.1", sdkVersion: "0.1", packageId: "example.importer", packageVersion: "1.0.0", domainId: "example", nodes: [], recordingMappers: [{ id: "click-mapper", version: "1.0.0", description: "Maps clicks", outputIds: ["click"] }] };
    const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, { packageId: "example.importer", packageVersion: "1.0.0", implementations: {}, recordingMappers: { "click-mapper": () => ({ outputId: "click", parameters: { target: "submit", payload: "x".repeat(300_000) }, confidence: 0.9 }) } });
    const service = createService({ dataDir: tempRoot }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
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
    const service = createService({ dataDir: tempRoot });
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
    const service = createService({ dataDir: tempRoot }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
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
    const service = createService({ dataDir: tempRoot }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
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
    const service = createService({ dataDir: tempRoot, seedFixture: false }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
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
    const service = createService({ dataDir: tempRoot, seedFixture: false }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
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
    const service = createService({ dataDir: tempRoot, seedFixture: false }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
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
});
