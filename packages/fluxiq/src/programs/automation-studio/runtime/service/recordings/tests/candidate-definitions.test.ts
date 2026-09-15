import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AutomationStudioRecordOutput, AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { IoRegistry, createEnvelope } from "../../../../../../io/index.ts";
import type { AutomationStudioFlowArtifact, AutomationStudioFlowDocument } from "../../../../model/index.ts";
import { getAutomationNodeDefinition } from "../../../../nodes/index.ts";
import type { AutomationStudioImporterSdkManifest, AutomationStudioNodeDefinition, AutomationStudioRecordingMapperImplementation } from "../../../../nodes/index.ts";
import { runCanonicalAutomationStudioFlow } from "../../../composite-executor.ts";
import type { AutomationStudioRecordBatch } from "../../../executor.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { recordingProposalDefinitionId, type RecordingFlowActionCandidate, type RecordingFlowProposalArtifact } from "../../../recording-flow-proposal.ts";
import { AutomationStudioService } from "../../../service.ts";
import { materializeRecordingNode, recordingCandidateDefinition, recordingCandidateParameters } from "../candidate-definitions.ts";

// `candidate-definitions.ts`: a reviewed recording proposal approved into node
// definitions, and a Flow node naming one of those definitions run as the
// recorded output action it stands for. The first service rows run through
// `AutomationStudioService` and were written, and passed, before the three
// functions moved out of `service.ts`; they pass unchanged after. The record
// output rows follow them. The direct rows at the end pin the branches a
// service run cannot observe.

let tempRoot: string;
const services = new Set<AutomationStudioService>();

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-candidate-definitions-"));
});

afterEach(async () => {
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

type Dispatched = { outputId: string; payload: unknown };
type Waited = { inputId: string; timeoutMs: number | undefined };

// The first click is proposed with a label, a description, and a confirmation;
// the second with none of them.
const clickMapper: AutomationStudioRecordingMapperImplementation = (observation) => {
  if (observation.payload.observationType !== "clicked") return null;
  const step = (observation.payload.payload as JsonObject).step as number;
  return step === 0
    ? { outputId: "click", parameters: { field: "submit", step }, sourceInputIds: ["clicked"], confidence: 0.9, label: "Submit the form", description: "Clicks the submit button.", expectedConfirmation: { inputId: "clicked", timeoutMs: 250 } }
    : { outputId: "click", parameters: { field: "next", step }, sourceInputIds: ["clicked"], confidence: 0.9 };
};

// One action input that confirms as soon as it is waited on, one output, and the
// click mapper. Every dispatch and every confirmation wait is recorded.
async function projectWithClickMapper(): Promise<{ service: AutomationStudioService; projectId: string; dispatched: Dispatched[]; waited: Waited[] }> {
  const dispatched: Dispatched[] = [];
  const waited: Waited[] = [];
  const io = new IoRegistry();
  io.registerInput("example", {
    definition: { id: "clicked", title: "Clicked", role: "action", outputId: "click" },
    mode: "stream",
    subscribe: (handler) => {
      queueMicrotask(() => handler(createEnvelope({ domainId: "example", ioId: "clicked", payload: { ok: true } })));
      return () => undefined;
    }
  });
  io.registerOutput("example", {
    definition: { id: "click", title: "Click" },
    mode: "request",
    dispatch: (request) => {
      dispatched.push({ outputId: request.outputId, payload: structuredClone(request.payload) });
      return { ok: true, domainId: "example", outputId: request.outputId, payload: {} };
    }
  });
  const waitForInput = io.waitForInput.bind(io);
  io.waitForInput = ((params: Parameters<IoRegistry["waitForInput"]>[0]) => {
    waited.push({ inputId: params.inputId, timeoutMs: params.timeoutMs });
    return waitForInput(params);
  }) as unknown as IoRegistry["waitForInput"];
  const manifest: AutomationStudioImporterSdkManifest = {
    schemaVersion: "0.1",
    sdkVersion: "0.1",
    packageId: "example.importer",
    packageVersion: "1.0.0",
    domainId: "example",
    nodes: [],
    recordingMappers: [{ id: "click-mapper", version: "1.0.0", description: "Maps recorded clicks", outputIds: ["click"] }]
  };
  const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, { packageId: "example.importer", packageVersion: "1.0.0", implementations: {}, recordingMappers: { "click-mapper": clickMapper } });
  const service = new AutomationStudioService({ dataDir: tempRoot }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
  services.add(service);
  const project = await service.createProject({ name: "Candidate definitions", domainId: "example" });
  return { service, projectId: project.id, dispatched, waited };
}

// Two clicks recorded and proposed: the first candidate confirmed, the second not.
async function proposeTwoClicks(service: AutomationStudioService, projectId: string, recordingId: string): Promise<RecordingFlowProposalArtifact> {
  const recording = await service.createRecording({ projectId, recordingId, domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
  await service.appendRecordingEvents({
    projectId,
    recordingId: recording.recordingId,
    entries: [0, 1].map((step) => ({ type: "observation" as const, observationType: "clicked", payload: { inputId: "clicked", step } }))
  });
  const { proposals: [proposal] } = await service.createRecordingFlowProposals({ projectId, recordingId: recording.recordingId });
  if (!proposal) throw new Error("The recording produced no proposal.");
  expect(proposal.candidates).toHaveLength(2);
  return proposal;
}

// The definitions the current code writes for the two candidates, spelled out.
function expectedDefinitions(proposal: RecordingFlowProposalArtifact, visibility: "private" | "public"): AutomationStudioNodeDefinition[] {
  const [confirmed, plain] = proposal.candidates;
  const common = {
    schemaVersion: "0.1" as const,
    version: "1.0.0",
    category: "recording-derived",
    source: { kind: "recording" as const, proposalId: proposal.proposalId, mapperId: "click-mapper" },
    availability: { kind: "domain" as const, domainId: "example" },
    capabilities: { executable: true as const, recordable: true as const, retryable: true as const },
    outputAction: { fixedOutputId: "click" },
    inputs: [{ id: "ready", label: "Ready", valueType: "any" as const, role: "control" as const }],
    outputs: [
      { id: "success", label: "Success", valueType: "any" as const, role: "success" as const },
      { id: "failed", label: "Failed", valueType: "any" as const, role: "failure" as const },
      { id: "records", label: "Records", valueType: "array" as const, role: "data" as const }
    ],
    icon: "wand-sparkles"
  };
  // The recorded action's own settings, after its payload and any confirmation.
  const settings = (candidate: RecordingFlowActionCandidate) => [
    { id: "timeoutMs", label: "Give up after milliseconds", description: "Maximum time to wait before treating this action as failed.", valueType: "number" as const, defaultValue: candidate.timeoutMs ?? 5_000 },
    { id: "recordOutput", label: "Save extracted records", description: "Save the records this output returns as a table. Leave off to save none.", valueType: "json" as const, defaultValue: (candidate.recordOutput ?? null) as unknown as JsonObject | null, allowStateBinding: false, ui: { control: "record-output" as const } }
  ];
  return [
    {
      ...common,
      id: recordingProposalDefinitionId(proposal.proposalId, confirmed!.candidateId),
      label: "Submit the form",
      description: "Clicks the submit button.",
      parameters: [
        { id: "parameters", label: "Output payload", description: "Values passed to this recorded output action.", valueType: "object", defaultValue: confirmed!.parameters },
        { id: "confirmationInputId", label: "Confirmation input", description: "Action input stream that confirms the output occurred.", valueType: "string", defaultValue: "clicked", ui: { control: "identifier", placeholder: "Registered action input ID" } },
        { id: "confirmationTimeoutMs", label: "Confirmation timeout", description: "How long to wait for confirmation.", valueType: "number", defaultValue: 250 },
        ...settings(confirmed!)
      ],
      metadata: { visibility, candidateId: confirmed!.candidateId, outputId: "click", parameters: confirmed!.parameters, expectedConfirmation: { inputId: "clicked", timeoutMs: 250 }, evidence: confirmed!.evidence as unknown as JsonObject[], sourceObservationIds: confirmed!.sourceObservationIds, policyStateEligible: false }
    },
    {
      ...common,
      id: recordingProposalDefinitionId(proposal.proposalId, plain!.candidateId),
      label: "click",
      description: "Reviewed recording-derived action for click.",
      parameters: [
        { id: "parameters", label: "Output payload", description: "Values passed to this recorded output action.", valueType: "object", defaultValue: plain!.parameters },
        ...settings(plain!)
      ],
      metadata: { visibility, candidateId: plain!.candidateId, outputId: "click", parameters: plain!.parameters, evidence: plain!.evidence as unknown as JsonObject[], sourceObservationIds: plain!.sourceObservationIds, policyStateEligible: false }
    }
  ];
}

describe("a recording proposal approved into node definitions", () => {
  it("is one definition per candidate, naming its output, payload, and confirmation", async () => {
    const { service, projectId } = await projectWithClickMapper();
    const proposal = await proposeTwoClicks(service, projectId, "recording.definitions");
    // The precondition: a domain proposal whose candidates carry no state link, so no link fields are written.
    expect(proposal.domainId).toBe("example");
    expect(proposal.candidates.map((candidate) => candidate.stateLink)).toEqual([undefined, undefined]);
    const reviewed = await service.reviewRecordingFlowProposal({ projectId, proposalId: proposal.proposalId, decision: "approved", destination: { kind: "node", visibility: "public" } });
    const expected = expectedDefinitions(proposal, "public");
    expect(reviewed.proposal.approvedDefinitions).toEqual(expected);
    expect(reviewed.proposal.review?.destination).toEqual({ kind: "node", visibility: "public", definitionIds: expected.map((definition) => definition.id) });
    expect(await service.listRecordingDerivedNodeDefinitions(projectId)).toEqual(expected);
  });

  it("carries the visibility the review chose", async () => {
    const { service, projectId } = await projectWithClickMapper();
    const proposal = await proposeTwoClicks(service, projectId, "recording.private-definitions");
    const reviewed = await service.reviewRecordingFlowProposal({ projectId, proposalId: proposal.proposalId, decision: "approved", destination: { kind: "node", visibility: "private" } });
    expect(reviewed.proposal.approvedDefinitions).toEqual(expectedDefinitions(proposal, "private"));
  });
});

describe("a Flow node naming an approved recording definition", () => {
  it("runs as that definition's output action, with its payload and confirmation, while any other node runs as authored", async () => {
    const { service, projectId, dispatched, waited } = await projectWithClickMapper();
    const proposal = await proposeTwoClicks(service, projectId, "recording.materialized");
    const reviewed = await service.reviewRecordingFlowProposal({ projectId, proposalId: proposal.proposalId, decision: "approved", destination: { kind: "node", visibility: "public" } });
    const [confirmedDefinition, plainDefinition] = reviewed.proposal.approvedDefinitions ?? [];
    const [confirmed, plain] = proposal.candidates;
    const flow: AutomationStudioFlowDocument = {
      schemaVersion: "0.1",
      flowId: "flow.recording-definitions",
      ownerKind: "policy",
      ownerId: "flow.recording-definitions",
      name: "Recording definitions",
      nodes: [
        // The node's own payload is replaced by the one its definition recorded.
        { id: "confirmed", definitionId: confirmedDefinition!.id, parameterValues: { parameters: { authored: "replaced" } } },
        { id: "plain", definitionId: plainDefinition!.id },
        { id: "authored", definitionId: "builtin.policy.action", parameterValues: { outputId: "click", parameters: { authored: "kept" } } }
      ],
      edges: [
        { id: "edge.confirmed-plain", sourceNodeId: "confirmed", targetNodeId: "plain", sourcePortId: "success", targetPortId: "ready" },
        { id: "edge.plain-authored", sourceNodeId: "plain", targetNodeId: "authored", sourcePortId: "success", targetPortId: "ready" }
      ],
      createdAt: 1,
      updatedAt: 1
    };
    const session = await service.runRuntimeSession({ projectId, flow });
    expect(session.status).toBe("succeeded");
    expect(dispatched).toEqual([
      { outputId: "click", payload: confirmed!.parameters },
      { outputId: "click", payload: plain!.parameters },
      { outputId: "click", payload: { authored: "kept" } }
    ]);
    expect(waited).toEqual([{ inputId: "clicked", timeoutMs: 250 }]);
  });
});

// One field kept, and one the schema excludes.
function productSchema(): AutomationStudioRecordOutput["schema"] {
  return { schemaVersion: "0.1", fields: [{ id: "name", label: "Name", valueType: "string", required: true }, { id: "email", label: "Email", valueType: "string", handling: "exclude" }] };
}

// An `extract` output that declares where its records are, and a mapper that
// proposes each recorded click as that output with a record output naming no
// recordsPath and a 30,000 ms timeout.
async function projectWithExtractionMapper(): Promise<{ service: AutomationStudioService; projectId: string }> {
  const io = new IoRegistry();
  io.registerInput("example", { definition: { id: "clicked", title: "Clicked", role: "action", outputId: "extract" }, mode: "stream", subscribe: () => () => undefined });
  io.registerOutput("example", { definition: { id: "extract", title: "Extract", metadata: { recordsPath: "extracted" } }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId, payload: {} }) });
  const extractMapper: AutomationStudioRecordingMapperImplementation = (observation) => observation.payload.observationType === "clicked"
    ? { outputId: "extract", parameters: { list: "products" }, confidence: 0.9, recordOutput: { datasetId: "products", schema: productSchema(), writeMode: "append" }, timeoutMs: 30_000 }
    : null;
  const manifest: AutomationStudioImporterSdkManifest = {
    schemaVersion: "0.1",
    sdkVersion: "0.1",
    packageId: "example.importer",
    packageVersion: "1.0.0",
    domainId: "example",
    nodes: [],
    recordingMappers: [{ id: "extract-mapper", version: "1.0.0", description: "Maps recorded clicks to extractions", outputIds: ["extract"] }]
  };
  const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, { packageId: "example.importer", packageVersion: "1.0.0", implementations: {}, recordingMappers: { "extract-mapper": extractMapper } });
  const service = new AutomationStudioService({ dataDir: tempRoot }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
  services.add(service);
  const project = await service.createProject({ name: "Record definitions", domainId: "example" });
  return { service, projectId: project.id };
}

describe("a recording proposal with a record output approved into a node definition", () => {
  it("carries the record output and timeout into the definition, and a node naming it runs as an action whose rows reach the record hook without the excluded field", async () => {
    const { service, projectId } = await projectWithExtractionMapper();
    const recording = await service.createRecording({ projectId, recordingId: "recording.record-definition", domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
    await service.appendRecordingEvents({ projectId, recordingId: recording.recordingId, entries: [{ type: "observation", observationType: "clicked", payload: { inputId: "clicked", step: 0 } }] });
    const { proposals: [proposal] } = await service.createRecordingFlowProposals({ projectId, recordingId: recording.recordingId });
    const lifted = proposal?.candidates[0]?.recordOutput;
    expect(lifted).toMatchObject({ datasetId: "products", recordsPath: "extracted", writeMode: "append" });
    await service.reviewRecordingFlowProposal({ projectId, proposalId: proposal!.proposalId, decision: "approved", destination: { kind: "node", visibility: "public" } });
    const definitions = await service.listRecordingDerivedNodeDefinitions(projectId);
    expect(definitions).toHaveLength(1);
    const definition = definitions[0]!;
    expect(definition.metadata?.recordOutput).toEqual(lifted);
    expect(definition.metadata?.timeoutMs).toBe(30_000);

    const flow: AutomationStudioFlowDocument = {
      schemaVersion: "0.1",
      flowId: "flow.record-definition",
      ownerKind: "policy",
      ownerId: "flow.record-definition",
      name: "Record definition",
      nodes: [{ id: "extract", definitionId: definition.id }],
      edges: [],
      createdAt: 1,
      updatedAt: 1
    };
    const dispatched: JsonValue[] = [];
    const batches: AutomationStudioRecordBatch[] = [];
    // The service materializes a stored Flow the same way before it runs one; the
    // canonical executor reads only the graph, so the document stands in for the artifact.
    const materialized = { ...flow, nodes: flow.nodes.map((node) => materializeRecordingNode(node, definition)) } as unknown as AutomationStudioFlowArtifact;
    const trace = await runCanonicalAutomationStudioFlow(materialized, [], {
      effectDispatcher: (effect) => {
        dispatched.push(structuredClone(effect.payload ?? null));
        return { status: "success", route: "success", outputs: { result: { extracted: [{ name: "Desk lamp", email: "buyer@example.test" }] } } };
      },
      onRecordBatch: (batch): AutomationStudioRunDatasetSummary => {
        batches.push(batch);
        return { runId: "run.record-definition", datasetId: batch.datasetId, nodeIds: [batch.nodeId], schemaDigest: "digest", recordCount: batch.rows.length, truncated: batch.truncated, invalidCount: batch.invalidCount, updatedAt: 1 };
      }
    });
    expect(trace.status).toBe("succeeded");
    expect(dispatched).toEqual([expect.objectContaining({ outputId: "extract", parameters: { list: "products" }, recordOutput: lifted, timeoutMs: 30_000 })]);
    expect(batches.map((batch) => ({ nodeId: batch.nodeId, datasetId: batch.datasetId, rows: batch.rows }))).toEqual([{ nodeId: "extract", datasetId: "products", rows: [{ name: "Desk lamp" }] }]);
  });
});

describe("the candidate definition functions, called directly", () => {
  const candidate: RecordingFlowActionCandidate = {
    candidateId: "candidate.entry-1.fixed",
    actionEntryId: "entry-1",
    sourceObservationIds: ["entry-1"],
    sourceInputIds: ["clicked"],
    outputId: "click",
    parameters: { field: "submit" },
    confidence: 0.9,
    evidence: [{ layer: "recording", artifactId: "recording.direct", entryId: "entry-1" }],
    policyStateEligible: false
  };
  const proposal: RecordingFlowProposalArtifact = {
    schemaVersion: "0.1",
    proposalId: "proposal.direct",
    projectId: "project.direct",
    recordingId: "recording.direct",
    domainId: null,
    mapper: { id: "click-mapper", version: "1.0.0", packageId: "example.importer", packageVersion: "1.0.0" },
    status: "proposed",
    candidates: [candidate],
    generatedAt: 1,
    updatedAt: 1
  };

  it("makes a domainless proposal's definition global and writes a candidate's state link into its metadata", () => {
    const stateLink = { recordingId: "recording.direct", actionEntryId: "entry-1", stateSnapshotId: "state-1", stateRef: "states/state-1.json" };
    const definition = recordingCandidateDefinition(proposal, { ...candidate, stateLink }, "private");
    expect(definition.id).toBe("recording.proposal.direct.candidate.entry-1.fixed");
    expect(definition.availability).toEqual({ kind: "global" });
    expect(definition.metadata).toEqual({
      visibility: "private",
      candidateId: "candidate.entry-1.fixed",
      outputId: "click",
      parameters: { field: "submit" },
      evidence: [{ layer: "recording", artifactId: "recording.direct", entryId: "entry-1" }],
      sourceObservationIds: ["entry-1"],
      stateLink,
      stateSnapshotId: "state-1",
      stateRef: "states/state-1.json",
      policyStateEligible: false
    });
    expect(definition.metadata).not.toHaveProperty("screenshotRef");
  });

  it("offers an empty payload for a non-object one, and defaults a confirmation's input to empty and its timeout to 5000 ms", () => {
    expect(recordingCandidateParameters({ ...candidate, parameters: ["not", "an", "object"] as unknown as JsonObject }).map((parameter) => [parameter.id, parameter.defaultValue])).toEqual([
      ["parameters", {}],
      ["timeoutMs", 5_000],
      ["recordOutput", null]
    ]);
    const defaults = recordingCandidateParameters({ ...candidate, expectedConfirmation: { inputId: undefined as unknown as string } });
    expect(defaults.map((parameter) => [parameter.id, parameter.defaultValue])).toEqual([["parameters", { field: "submit" }], ["confirmationInputId", ""], ["confirmationTimeoutMs", 5_000], ["timeoutMs", 5_000], ["recordOutput", null]]);
  });

  it("returns a node unchanged when it names no recording definition", () => {
    const node = { id: "authored", definitionId: "builtin.policy.action", parameterValues: { outputId: "click" } };
    const definition = recordingCandidateDefinition(proposal, candidate, "public");
    expect(materializeRecordingNode(node, undefined)).toBe(node);
    expect(materializeRecordingNode(node, { ...definition, source: { kind: "builtin", implementationKey: "policy.action" } })).toBe(node);
  });

  it("turns a node naming a recording definition into the policy action, keeping its other values and metadata", () => {
    const definition = recordingCandidateDefinition(proposal, { ...candidate, expectedConfirmation: { inputId: "clicked" } }, "public");
    const node = { id: "recorded", definitionId: definition.id, label: "Kept", parameterValues: { parameters: { authored: "replaced" }, timeoutMs: 900 }, metadata: { authored: true } };
    expect(materializeRecordingNode(node, definition)).toEqual({
      id: "recorded",
      definitionId: "builtin.policy.action",
      label: "Kept",
      parameterValues: { parameters: { field: "submit" }, timeoutMs: 900, outputId: "click", confirmationInputId: "clicked", confirmationTimeoutMs: 5_000 },
      metadata: { authored: true, recordingDefinitionId: definition.id, recordingProposalId: "proposal.direct" }
    });
    expect(node.definitionId).toBe(definition.id);
  });

  it("drops an output id its definition lacks, defaults the payload to empty, and writes no confirmation without a string input id", () => {
    const definition = recordingCandidateDefinition(proposal, candidate, "public");
    const node: { id: string; definitionId: string; parameterValues?: JsonObject; metadata?: JsonObject } = { id: "recorded", definitionId: definition.id };
    const materialized = materializeRecordingNode(node, { ...definition, metadata: { expectedConfirmation: { inputId: 7 } } });
    expect(materialized).toEqual({ id: "recorded", definitionId: "builtin.policy.action", parameterValues: { parameters: {} }, metadata: { recordingDefinitionId: definition.id, recordingProposalId: "proposal.direct" } });
    expect(materialized.parameterValues).not.toHaveProperty("outputId");
    expect(materialized.parameterValues).not.toHaveProperty("confirmationInputId");
  });

  const recordOutput: AutomationStudioRecordOutput = { datasetId: "products", recordsPath: "extracted", schema: productSchema(), writeMode: "append" };

  it("writes a candidate's record output, as a copy, and its timeout into its definition's metadata", () => {
    const withRecords: RecordingFlowActionCandidate = { ...candidate, recordOutput: structuredClone(recordOutput), timeoutMs: 30_000 };
    const definition = recordingCandidateDefinition(proposal, withRecords, "public");
    expect(definition.metadata).toMatchObject({ recordOutput, timeoutMs: 30_000 });
    expect(definition.metadata?.recordOutput).not.toBe(withRecords.recordOutput);
  });

  it("offers the recorded extraction and timeout as the editable parameters' defaults", () => {
    const withRecords: RecordingFlowActionCandidate = { ...candidate, recordOutput: structuredClone(recordOutput), timeoutMs: 30_000 };
    expect(recordingCandidateParameters(withRecords).map((parameter) => [parameter.id, parameter.defaultValue])).toEqual([["parameters", { field: "submit" }], ["timeoutMs", 30_000], ["recordOutput", recordOutput]]);
    expect(recordingCandidateParameters(candidate).map((parameter) => [parameter.id, parameter.defaultValue])).toEqual([["parameters", { field: "submit" }], ["timeoutMs", 5_000], ["recordOutput", null]]);
    // The default is a copy, so editing the node can never reach the stored definition.
    expect(recordingCandidateParameters(withRecords)[2]?.defaultValue).not.toBe(withRecords.recordOutput);
  });

  it("takes its definition's record output and timeout when the node holds none of its own", () => {
    const definition = recordingCandidateDefinition(proposal, { ...candidate, recordOutput: structuredClone(recordOutput), timeoutMs: 30_000 }, "public");
    const node: { id: string; definitionId: string; parameterValues?: JsonObject } = { id: "recorded", definitionId: definition.id };
    expect(materializeRecordingNode(node, definition).parameterValues).toEqual({ parameters: { field: "submit" }, outputId: "click", recordOutput, timeoutMs: 30_000 });
  });

  // The record-output editor and the timeout field write these onto the node. A
  // definition that overrode them would make every such edit do nothing, so an
  // operator who excluded a column would still have that column collected.
  it("keeps the node's own record output and timeout over its definition's", () => {
    const definition = recordingCandidateDefinition(proposal, { ...candidate, recordOutput: structuredClone(recordOutput), timeoutMs: 30_000 }, "public");
    const edited = { ...recordOutput, datasetId: "edited" } as unknown as JsonObject;
    const node = { id: "recorded", definitionId: definition.id, parameterValues: { recordOutput: edited, timeoutMs: 900 } };
    expect(materializeRecordingNode(node, definition).parameterValues).toEqual({ parameters: { field: "submit" }, outputId: "click", recordOutput: edited, timeoutMs: 900 });
  });

  it("saves no records when the node turned its definition's record output off", () => {
    const definition = recordingCandidateDefinition(proposal, { ...candidate, recordOutput: structuredClone(recordOutput), timeoutMs: 30_000 }, "public");
    const node = { id: "recorded", definitionId: definition.id, parameterValues: { recordOutput: null } };
    expect(materializeRecordingNode(node, definition).parameterValues).toMatchObject({ recordOutput: null, timeoutMs: 30_000 });
  });

  it("gives a node no record output or timeout its definition does not hold as an object and a number", () => {
    const definition = recordingCandidateDefinition(proposal, candidate, "public");
    const node: { id: string; definitionId: string; parameterValues?: JsonObject } = { id: "recorded", definitionId: definition.id };
    const materialized = materializeRecordingNode(node, { ...definition, metadata: { ...definition.metadata, recordOutput: ["products"], timeoutMs: "30000" } });
    expect(materialized.parameterValues).toEqual({ outputId: "click", parameters: { field: "submit" } });
  });
});

// One recorded click proposed as an extraction, approved into node definitions.
async function approvedExtractionDefinition(service: AutomationStudioService, projectId: string, recordingId: string): Promise<AutomationStudioNodeDefinition> {
  const recording = await service.createRecording({ projectId, recordingId, domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
  await service.appendRecordingEvents({ projectId, recordingId: recording.recordingId, entries: [{ type: "observation", observationType: "clicked", payload: { inputId: "clicked", step: 0 } }] });
  const { proposals: [proposal] } = await service.createRecordingFlowProposals({ projectId, recordingId: recording.recordingId });
  await service.reviewRecordingFlowProposal({ projectId, proposalId: proposal!.proposalId, decision: "approved", destination: { kind: "node", visibility: "public" } });
  const [definition] = await service.listRecordingDerivedNodeDefinitions(projectId);
  if (!definition) throw new Error("The approved proposal produced no node definition.");
  return definition;
}

describe("a recorded extraction's records, as a later node reaches them", () => {
  it("are offered by the same records port, and edited by the same control, as the policy action the node becomes", async () => {
    const { service, projectId } = await projectWithExtractionMapper();
    const definition = await approvedExtractionDefinition(service, projectId, "recording.records-port");
    const policyAction = getAutomationNodeDefinition("builtin.policy.action");

    expect(definition.outputs.find((port) => port.id === "records")).toEqual(policyAction?.outputs.find((port) => port.id === "records"));
    // The control, not the value: the definition's default is the extraction the recording proposed.
    const { defaultValue: recorded, ...control } = definition.parameters.find((parameter) => parameter.id === "recordOutput") ?? {};
    const { defaultValue: _authored, ...authoredControl } = policyAction?.parameters.find((parameter) => parameter.id === "recordOutput") ?? {};
    expect(control).toEqual(authoredControl);
    expect(recorded).toEqual(definition.metadata?.recordOutput);
  });

  it("feed a For Each over the recorded node's records port, which runs its body once for each extracted row", async () => {
    const { service, projectId } = await projectWithExtractionMapper();
    const definition = await approvedExtractionDefinition(service, projectId, "recording.for-each-records");
    const edge = (sourceNodeId: string, sourcePortId: string, targetNodeId: string, targetPortId = "in") => ({ id: `${sourceNodeId}.${sourcePortId}.${targetNodeId}.${targetPortId}`, sourceNodeId, sourcePortId, targetNodeId, targetPortId });
    const flow: AutomationStudioFlowDocument = {
      schemaVersion: "0.1",
      flowId: "flow.for-each-records",
      ownerKind: "policy",
      ownerId: "flow.for-each-records",
      name: "Iterate a recorded extraction",
      nodes: [
        { id: "extract", definitionId: definition.id },
        { id: "each", definitionId: "builtin.control.for-each" },
        { id: "visit", definitionId: "builtin.data.constant", parameterValues: { value: "synthetic-visit" } },
        { id: "end", definitionId: "builtin.control.end" }
      ],
      edges: [
        edge("extract", "success", "each"),
        // The port this closes the gap on: without it an author has nothing to draw from.
        edge("extract", "records", "each", "items"),
        edge("each", "body", "visit"),
        edge("visit", "success", "each"),
        edge("each", "done", "end")
      ],
      createdAt: 1,
      updatedAt: 1
    };
    const batches: AutomationStudioRecordBatch[] = [];
    // Materialized by definition id, as the service does: only the recorded node
    // names this definition, and the For Each and its body must stay themselves.
    const definitionsById = new Map([[definition.id, definition]]);
    const materialized = { ...flow, nodes: flow.nodes.map((node) => materializeRecordingNode(node, definitionsById.get(node.definitionId))) } as unknown as AutomationStudioFlowArtifact;
    const trace = await runCanonicalAutomationStudioFlow(materialized, [], {
      effectDispatcher: () => ({ status: "success", route: "success", outputs: { result: { extracted: [{ name: "Desk lamp", email: "buyer@example.test" }, { name: "Floor lamp", email: "other@example.test" }] } } }),
      onRecordBatch: (batch): AutomationStudioRunDatasetSummary => {
        batches.push(batch);
        return { runId: "run.for-each-records", datasetId: batch.datasetId, nodeIds: [batch.nodeId], schemaDigest: "digest", recordCount: batch.rows.length, truncated: batch.truncated, invalidCount: batch.invalidCount, updatedAt: 1 };
      }
    });
    const passes = trace.attempts.filter((attempt) => attempt.nodeId === "each");

    expect({ status: trace.status, message: trace.message }).toEqual({ status: "succeeded", message: undefined });
    // Two body passes then done: the records arrived as a list, so For Each iterated them.
    // Without the edge's rows it would fail with for_each.items_invalid instead.
    expect(passes.map((attempt) => attempt.route)).toEqual(["body", "body", "done"]);
    expect(passes.slice(0, 2).map((attempt) => attempt.outputs.item)).toEqual([
      { $datasetRow: { datasetId: "products", ordinal: 1 } },
      { $datasetRow: { datasetId: "products", ordinal: 2 } }
    ]);
    expect(batches.map((batch) => batch.rows)).toEqual([[{ name: "Desk lamp" }, { name: "Floor lamp" }]]);
    // The excluded field reaches neither the body nor the saved trace.
    expect(JSON.stringify(trace)).not.toContain("buyer@example.test");
  });
});
