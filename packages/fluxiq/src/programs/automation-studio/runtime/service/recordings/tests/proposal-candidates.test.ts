import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseAutomationStudioRecordOutput, type AutomationStudioRecordOutput, type AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject, JsonValue } from "../../../../../../core/index.ts";
import { IoRegistry } from "../../../../../../io/index.ts";
import type { AppendRecordingEntryInput } from "../../../../model/index.ts";
import type { AutomationStudioImporterSdkManifest, AutomationStudioRecordingMapperCandidate, AutomationStudioRecordingMapperImplementation, AutomationStudioRecordingMapperObservation } from "../../../../nodes/index.ts";
import { runCanonicalAutomationStudioFlow } from "../../../composite-executor.ts";
import { chooseAutomationStudioStartNode, type AutomationStudioRecordBatch } from "../../../executor.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AutomationStudioService } from "../../../service.ts";

// `proposal-candidates.ts` as the service uses it: a recording mapper's expected
// state, record output, and timeout through proposal generation and approval
// into a Flow, and the entries a mapper is shown after each observation. The
// rows run through `AutomationStudioService`, because the service is what calls
// the mappers and hands their candidates on; a row that called the module alone
// could pass while nothing invoked it.

let tempRoot: string;
const services = new Set<AutomationStudioService>();

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-recording-candidates-"));
});

afterEach(async () => {
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

// One action input; two outputs, `click` and `extract`, of which only `extract`
// declares where its records are; and the mappers a row supplies, in that order.
async function projectWithMappers(mappers: Record<string, AutomationStudioRecordingMapperImplementation>): Promise<{ service: AutomationStudioService; projectId: string }> {
  const io = new IoRegistry();
  io.registerInput("example", { definition: { id: "clicked", title: "Clicked", role: "action", outputId: "click" }, mode: "stream", subscribe: () => () => undefined });
  io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId, payload: {} }) });
  io.registerOutput("example", { definition: { id: "extract", title: "Extract", metadata: { recordsPath: "extracted" } }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId, payload: {} }) });
  const manifest: AutomationStudioImporterSdkManifest = {
    schemaVersion: "0.1",
    sdkVersion: "0.1",
    packageId: "example.importer",
    packageVersion: "1.0.0",
    domainId: "example",
    nodes: [],
    recordingMappers: Object.keys(mappers).map((id) => ({ id, version: "1.0.0", description: `Mapper ${id}`, outputIds: ["click", "extract"] }))
  };
  const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, { packageId: "example.importer", packageVersion: "1.0.0", implementations: {}, recordingMappers: mappers });
  const service = new AutomationStudioService({ dataDir: tempRoot }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
  services.add(service);
  const project = await service.createProject({ name: "Recording candidates", domainId: "example" });
  return { service, projectId: project.id };
}

// `count` clicked observations, with a client state snapshot before every
// `stateEvery`th one when it is set.
async function recordClicks(service: AutomationStudioService, projectId: string, recordingId: string, count: number, stateEvery = 0): Promise<string> {
  const recording = await service.createRecording({ projectId, recordingId, domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
  const entries: AppendRecordingEntryInput[] = [];
  for (let step = 0; step < count; step += 1) {
    if (stateEvery && step % stateEvery === 0) entries.push({ type: "observation", observationType: "client.state_snapshot", payload: { state: { timestamp: 2 + step, namespaces: {} } } });
    entries.push({ type: "observation", observationType: "clicked", payload: { inputId: "clicked", step } });
  }
  await service.appendRecordingEvents({ projectId, recordingId: recording.recordingId, entries });
  return recording.recordingId;
}

async function approvedGraph(service: AutomationStudioService, projectId: string, proposalId: string) {
  const reviewed = await service.reviewRecordingFlowProposal({ projectId, proposalId, decision: "approved", destination: { kind: "flow", name: "Approved clicks" } });
  const page = await service.listFlowSubflowSummaries({ projectId, flowId: reviewed.flow!.flowId, role: "primary", limit: 10, offset: 0 });
  const graphFlowId = page.subflows[0]?.graphFlowId;
  if (!graphFlowId) throw new Error("The approved Flow has no primary Subflow graph.");
  return await service.getFlow(projectId, graphFlowId);
}

function isClick(observation: AutomationStudioRecordingMapperObservation): boolean {
  return observation.payload.observationType === "clicked";
}

// Proposes one click for each value, handing that value as its expected state,
// and approves the proposal into a Flow: every click is still proposed, and no
// candidate and no node carries an expected state.
async function expectEveryExpectedStateDropped(values: readonly unknown[], recordingId: string): Promise<void> {
  let call = 0;
  const { service, projectId } = await projectWithMappers({
    "click-mapper": (observation) => isClick(observation) ? { outputId: "click", parameters: { target: `step-${call}` }, sourceInputIds: ["clicked"], confidence: 0.9, expectedState: values[call++] as JsonObject } : null
  });
  const recorded = await recordClicks(service, projectId, recordingId, values.length);
  const { proposals: [proposal], issues } = await service.createRecordingFlowProposals({ projectId, recordingId: recorded });
  expect(call).toBe(values.length);
  expect(issues.filter((issue) => issue.includes("could not map"))).toEqual([]);
  expect(proposal?.candidates).toHaveLength(values.length);
  for (const candidate of proposal?.candidates ?? []) expect(candidate).not.toHaveProperty("expectedState");
  const graph = await approvedGraph(service, projectId, proposal!.proposalId);
  expect(graph.nodes).toHaveLength(values.length);
  for (const node of graph.nodes) expect(node.parameterValues).not.toHaveProperty("expectedState");
}

describe("a recording mapper's expected state", () => {
  it("reaches the approved node's parameterValues as a clone of what the mapper proposed", async () => {
    const proposed: JsonObject = { conditions: [{ assert: { kind: "url", expected: "/account" } }], mode: "all", timeoutMs: 5000 };
    const { service, projectId } = await projectWithMappers({
      "click-mapper": (observation) => isClick(observation) ? { outputId: "click", parameters: { target: "submit" }, sourceInputIds: ["clicked"], confidence: 0.9, expectedState: proposed } : null
    });
    const recordingId = await recordClicks(service, projectId, "recording.expected-state", 1);
    const { proposals: [proposal] } = await service.createRecordingFlowProposals({ projectId, recordingId });
    // The mapper still holds its object; nothing it does to it now reaches the proposal.
    (proposed.conditions as JsonObject[])[0] = { assert: { kind: "url", expected: "/elsewhere" } };
    proposed.mode = "any";
    const original = { conditions: [{ assert: { kind: "url", expected: "/account" } }], mode: "all", timeoutMs: 5000 };
    expect(proposal?.candidates).toHaveLength(1);
    expect(proposal?.candidates[0]?.expectedState).toEqual(original);
    const graph = await approvedGraph(service, projectId, proposal!.proposalId);
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]).toMatchObject({ definitionId: "builtin.policy.action", parameterValues: { outputId: "click", expectedState: original } });
  });

  it("is dropped, and the action still proposed, when it is not a plain object", async () => {
    await expectEveryExpectedStateDropped([["not", "an", "object"], "url:/account", 42, true, null, new Date(0), new Map([["mode", "all"]]), { check: () => true }, undefined], "recording.dropped-state");
  });

  it("is dropped, and the action still proposed, when it has no keys", async () => {
    // A symbol key is an own key, but it does not survive the clone a proposal holds.
    await expectEveryExpectedStateDropped([{}, Object.create(null), { [Symbol("conditions")]: [{ assert: { kind: "url", expected: "/account" } }] }], "recording.empty-state");
  });
});

// A record output as a mapper proposes it, with no recordsPath: one field kept,
// and one the schema excludes.
function proposedRecordOutput(): JsonObject {
  return {
    datasetId: "products",
    label: "Products",
    schema: { schemaVersion: "0.1", fields: [{ id: "name", label: "Name", valueType: "string", required: true }, { id: "email", label: "Email", valueType: "string", handling: "exclude" }] },
    writeMode: "append",
    maxRecords: 50
  };
}

// The record output a proposal should hold for `proposedRecordOutput()` at `recordsPath`.
function parsedRecordOutput(recordsPath: string): AutomationStudioRecordOutput {
  const parsed = parseAutomationStudioRecordOutput({ ...proposedRecordOutput(), recordsPath });
  if (!parsed.ok) throw new Error(`The fixture record output is invalid: ${parsed.issues.join(", ")}`);
  return parsed.output;
}

// One recorded click, which the mapper proposes as an `extract` action carrying
// whatever `extra` adds or overrides.
async function proposeExtraction(recordingId: string, extra: Record<string, unknown>) {
  const { service, projectId } = await projectWithMappers({
    "extract-mapper": (observation) => isClick(observation) ? { outputId: "extract", parameters: { list: "products" }, confidence: 0.9, ...extra } as AutomationStudioRecordingMapperCandidate : null
  });
  const recorded = await recordClicks(service, projectId, recordingId, 1);
  const { proposals, issues } = await service.createRecordingFlowProposals({ projectId, recordingId: recorded });
  return { service, projectId, proposals, issues };
}

// The mapper's only candidate is rejected, so no proposal is made, and the
// reason ends the issue the service reports for it.
async function expectRejected(recordingId: string, extra: Record<string, unknown>, reason: string): Promise<void> {
  const { proposals, issues } = await proposeExtraction(recordingId, extra);
  expect(proposals).toEqual([]);
  expect(issues).toContainEqual(expect.stringMatching(new RegExp(`${reason.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)));
}

function datasetSummary(batch: AutomationStudioRecordBatch): AutomationStudioRunDatasetSummary {
  return { runId: "run.recording-candidates", datasetId: batch.datasetId, nodeIds: [batch.nodeId], schemaDigest: "digest", recordCount: batch.rows.length, truncated: batch.truncated, invalidCount: batch.invalidCount, updatedAt: 1 };
}

describe("a recording mapper's record output", () => {
  it("keeps the recordsPath the candidate names, over the one its output declares", async () => {
    const { proposals: [proposal] } = await proposeExtraction("recording.explicit-path", { recordOutput: { ...proposedRecordOutput(), recordsPath: "page.rows" } });
    expect(proposal?.candidates).toHaveLength(1);
    expect(proposal?.candidates[0]?.recordOutput).toEqual(parsedRecordOutput("page.rows"));
  });

  it("takes the recordsPath its output declares in metadata when the candidate names none", async () => {
    const { proposals: [proposal] } = await proposeExtraction("recording.default-path", { recordOutput: proposedRecordOutput() });
    expect(proposal?.candidates).toHaveLength(1);
    expect(proposal?.candidates[0]?.recordOutput).toEqual(parsedRecordOutput("extracted"));
  });

  it("rejects the candidate when neither it nor its output names a recordsPath", async () => {
    await expectRejected("recording.no-path", { outputId: "click", recordOutput: proposedRecordOutput() }, "Recording mapper candidate for click has an invalid recordOutput: record_output.missing_records_path");
  });

  it("rejects the candidate when a field asks to be encrypted", async () => {
    const recordOutput = proposedRecordOutput();
    ((recordOutput.schema as JsonObject).fields as JsonObject[])[1]!.handling = "encrypt";
    await expectRejected("recording.encrypt", { recordOutput }, "Recording mapper candidate for extract has an invalid recordOutput: record_schema.encrypt_unavailable");
  });

  it.each([
    ["an array", [proposedRecordOutput()], "record_output.not_object"],
    ["a string", "products", "record_output.not_object"],
    ["false", false, "record_output.not_object"],
    ["carrying an unknown key", { ...proposedRecordOutput(), samples: [{ name: "planted" }] }, "record_output.unknown_key"],
    ["naming an invalid dataset id", { ...proposedRecordOutput(), datasetId: "has space" }, "record_output.invalid_dataset_id"],
    ["holding a value that cannot be cloned", { ...proposedRecordOutput(), toJSON: () => ({}) }, "record_output.invalid"]
  ] as const)("rejects the candidate when it is %s", async (_name, recordOutput, issue) => {
    await expectRejected("recording.invalid-record-output", { recordOutput }, `Recording mapper candidate for extract has an invalid recordOutput: ${issue}`);
  });

  it.each([
    ["gives none", {}],
    ["gives null", { recordOutput: null }]
  ] as const)("is not proposed, and the approved node carries none, when the candidate %s", async (_name, extra) => {
    const { service, projectId, proposals: [proposal] } = await proposeExtraction("recording.no-record-output", extra);
    expect(proposal?.candidates).toHaveLength(1);
    expect(proposal?.candidates[0]).not.toHaveProperty("recordOutput");
    expect(proposal?.candidates[0]).not.toHaveProperty("timeoutMs");
    const graph = await approvedGraph(service, projectId, proposal!.proposalId);
    expect(graph.nodes.map((node) => node.parameterValues)).toEqual([{ outputId: "extract", parameters: { list: "products" } }]);
  });

  it("is copied from each candidate, so a mapper changing its object later never reaches an earlier candidate", async () => {
    const shared = proposedRecordOutput();
    const { service, projectId } = await projectWithMappers({
      "extract-mapper": (observation) => {
        if (!isClick(observation)) return null;
        shared.datasetId = `products-${String((observation.payload.payload as JsonObject).step)}`;
        return { outputId: "extract", parameters: { list: "products" }, confidence: 0.9, recordOutput: shared as NonNullable<AutomationStudioRecordingMapperCandidate["recordOutput"]> };
      }
    });
    const recordingId = await recordClicks(service, projectId, "recording.record-output-copy", 2);
    const { proposals: [proposal] } = await service.createRecordingFlowProposals({ projectId, recordingId });
    shared.datasetId = "changed";
    ((shared.schema as JsonObject).fields as JsonObject[])[1]!.handling = "include";
    expect(proposal?.candidates.map((candidate) => candidate.recordOutput)).toEqual([
      { ...parsedRecordOutput("extracted"), datasetId: "products-0" },
      { ...parsedRecordOutput("extracted"), datasetId: "products-1" }
    ]);
  });

  it("is written, with the timeout, into the approved node, whose run hands the record hook its rows without the excluded field", async () => {
    const { service, projectId, proposals: [proposal] } = await proposeExtraction("recording.approved-record-output", { recordOutput: proposedRecordOutput(), timeoutMs: 30_000 });
    expect(proposal?.candidates).toHaveLength(1);
    expect(proposal?.candidates[0]).toMatchObject({ recordOutput: parsedRecordOutput("extracted"), timeoutMs: 30_000 });
    const graph = await approvedGraph(service, projectId, proposal!.proposalId);
    expect(graph.nodes.map((node) => node.parameterValues)).toEqual([{ outputId: "extract", parameters: { list: "products" }, recordOutput: parsedRecordOutput("extracted"), timeoutMs: 30_000 }]);

    const dispatched: JsonValue[] = [];
    const batches: AutomationStudioRecordBatch[] = [];
    const trace = await runCanonicalAutomationStudioFlow(graph, [], {
      effectDispatcher: (effect) => {
        dispatched.push(structuredClone(effect.payload ?? null));
        return { status: "success", route: "success", outputs: { result: { extracted: [{ name: "Desk lamp", email: "buyer@example.test" }] } } };
      },
      onRecordBatch: (batch) => {
        batches.push(batch);
        return datasetSummary(batch);
      }
    });
    expect(trace.status).toBe("succeeded");
    expect(dispatched).toEqual([expect.objectContaining({ outputId: "extract", recordOutput: parsedRecordOutput("extracted"), timeoutMs: 30_000 })]);
    expect(batches.map((batch) => ({ datasetId: batch.datasetId, rows: batch.rows }))).toEqual([{ datasetId: "products", rows: [{ name: "Desk lamp" }] }]);
  });
});

describe("a recording mapper's timeout", () => {
  it.each([
    ["zero", 0],
    ["negative", -1],
    ["fractional", 1.5],
    ["not a number", Number.NaN],
    ["infinite", Number.POSITIVE_INFINITY],
    ["a string", "30000"],
    ["null", null]
  ] as const)("rejects the candidate when it is %s", async (_name, timeoutMs) => {
    await expectRejected("recording.invalid-timeout", { timeoutMs }, "Recording mapper candidate for extract has an invalid timeoutMs: it must be a whole number of milliseconds above zero.");
  });
});

describe("where a run of an approved recording's Flow begins", () => {
  it("is the first candidate's node, though the graph index lists a later candidate's node first", async () => {
    const { service, projectId } = await projectWithMappers({
      "click-mapper": (observation) => isClick(observation) ? { outputId: "click", parameters: { target: `step-${String((observation.payload.payload as JsonObject).step)}` }, sourceInputIds: ["clicked"], confidence: 0.9 } : null
    });
    // Three state snapshots before twelve clicks put the first click at a
    // single-digit entry and later clicks at two-digit ones, which sort ahead of it.
    const recording = await service.createRecording({ projectId, recordingId: "recording.start-node", domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
    const entries: AppendRecordingEntryInput[] = [];
    for (let index = 0; index < 3; index += 1) entries.push({ type: "observation", observationType: "client.state_snapshot", payload: { state: { timestamp: 2 + index, namespaces: {} } } });
    for (let step = 0; step < 12; step += 1) entries.push({ type: "observation", observationType: "clicked", payload: { inputId: "clicked", step } });
    await service.appendRecordingEvents({ projectId, recordingId: recording.recordingId, entries });
    const { proposals: [proposal] } = await service.createRecordingFlowProposals({ projectId, recordingId: recording.recordingId });
    const candidateIds = (proposal?.candidates ?? []).map((candidate) => candidate.candidateId);
    expect(candidateIds).toHaveLength(12);

    const graph = await approvedGraph(service, projectId, proposal!.proposalId);
    const candidateOf = (nodeId: string | undefined) => graph.nodes.find((node) => node.id === nodeId)?.metadata?.recordingCandidateId;
    const listedIds = graph.nodes.map((node) => node.id);
    // The precondition: getFlow lists nodes in binary id order, and that order begins at a later candidate.
    expect(listedIds).toEqual([...listedIds].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)));
    expect(candidateOf(listedIds[0])).not.toBe(candidateIds[0]);

    expect(candidateOf(chooseAutomationStudioStartNode(graph).node?.id)).toBe(candidateIds[0]);
    const trace = await runCanonicalAutomationStudioFlow(graph, [], { effectDispatcher: () => ({ status: "success", route: "success", outputs: {} }) });
    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.map((attempt) => candidateOf(attempt.nodeId))).toEqual(candidateIds);
  });
});

describe("what a recording mapper is shown after each observation", () => {
  it("is the mapper-visible entries that follow it, in timeline order, at most 32", async () => {
    const calls: Array<{ observation: AutomationStudioRecordingMapperObservation; following: readonly AutomationStudioRecordingMapperObservation[] }> = [];
    const { service, projectId } = await projectWithMappers({
      "click-mapper": (observation, context) => {
        calls.push({ observation, following: context.following });
        return null;
      }
    });
    const recordingId = await recordClicks(service, projectId, "recording.following", 40, 10);
    await service.createRecordingFlowProposals({ projectId, recordingId });
    const timeline = (await service.getRecordingSession(recordingId, projectId)).timeline;
    // The recording holds state entries the mapper is never handed, as an observation or after one.
    expect(timeline.length).toBeGreaterThan(calls.length);
    expect(calls.every((item) => isClick(item.observation))).toBe(true);
    expect(calls.map((item) => (item.observation.payload.payload as JsonObject).step)).toEqual(Array.from({ length: 40 }, (_, step) => step));
    const ids = calls.map((item) => item.observation.observationId);
    calls.forEach((item, index) => {
      expect(item.following.map((next) => next.observationId), `following of call ${index}`).toEqual(ids.slice(index + 1, index + 33));
    });
    expect(calls[0]?.following).toHaveLength(32);
    expect(calls[calls.length - 1]?.following).toEqual([]);
    // An entry is shown after an observation exactly as the mapper is later handed it.
    expect(calls[0]?.following[0]).toEqual(calls[1]?.observation);
  });

  it("is built for each mapper, so one mapper's changes never reach another", async () => {
    const order: string[] = [];
    const seenBySecond: JsonObject[] = [];
    const { service, projectId } = await projectWithMappers({
      "first-mapper": (observation, context) => {
        order.push("first");
        observation.payload.touched = "by the first mapper";
        observation.metadata.touched = "by the first mapper";
        for (const next of context.following) {
          next.payload.touched = "by the first mapper";
          next.metadata.touched = "by the first mapper";
        }
        return null;
      },
      "second-mapper": (observation, context) => {
        order.push("second");
        seenBySecond.push(observation.payload, observation.metadata, ...context.following.flatMap((next) => [next.payload, next.metadata]));
        return null;
      }
    });
    const recordingId = await recordClicks(service, projectId, "recording.isolated-mappers", 3);
    await service.createRecordingFlowProposals({ projectId, recordingId });
    expect(order).toEqual(["first", "first", "first", "second", "second", "second"]);
    expect(seenBySecond).toHaveLength(3 * 2 + 2 * 2 + 1 * 2);
    expect(seenBySecond.filter((value) => "touched" in value)).toEqual([]);
  });
});
