import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { IoRegistry } from "../../../../../../io/index.ts";
import type { AppendRecordingEntryInput } from "../../../../model/index.ts";
import type { AutomationStudioImporterSdkManifest, AutomationStudioRecordingMapperImplementation, AutomationStudioRecordingMapperObservation } from "../../../../nodes/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AutomationStudioService } from "../../../service.ts";

// `proposal-candidates.ts` as the service uses it: a recording mapper's expected
// state through proposal generation and approval into a Flow, and the entries a
// mapper is shown after each observation. The rows run through
// `AutomationStudioService`, because the service is what calls the mappers and
// hands their candidates on; a row that called the module alone could pass while
// nothing invoked it.

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

// One action input, one output, and the mappers a row supplies, in that order.
async function projectWithMappers(mappers: Record<string, AutomationStudioRecordingMapperImplementation>): Promise<{ service: AutomationStudioService; projectId: string }> {
  const io = new IoRegistry();
  io.registerInput("example", { definition: { id: "clicked", title: "Clicked", role: "action", outputId: "click" }, mode: "stream", subscribe: () => () => undefined });
  io.registerOutput("example", { definition: { id: "click", title: "Click" }, mode: "request", dispatch: (request) => ({ ok: true, domainId: "example", outputId: request.outputId, payload: {} }) });
  const manifest: AutomationStudioImporterSdkManifest = {
    schemaVersion: "0.1",
    sdkVersion: "0.1",
    packageId: "example.importer",
    packageVersion: "1.0.0",
    domainId: "example",
    nodes: [],
    recordingMappers: Object.keys(mappers).map((id) => ({ id, version: "1.0.0", description: `Mapper ${id}`, outputIds: ["click"] }))
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
    const values: unknown[] = [["not", "an", "object"], "url:/account", 42, true, null, new Date(0), new Map([["mode", "all"]]), { check: () => true }, undefined];
    let call = 0;
    const { service, projectId } = await projectWithMappers({
      "click-mapper": (observation) => isClick(observation) ? { outputId: "click", parameters: { target: `step-${call}` }, sourceInputIds: ["clicked"], confidence: 0.9, expectedState: values[call++] as JsonObject } : null
    });
    const recordingId = await recordClicks(service, projectId, "recording.dropped-state", values.length);
    const { proposals: [proposal], issues } = await service.createRecordingFlowProposals({ projectId, recordingId });
    expect(call).toBe(values.length);
    expect(issues.filter((issue) => issue.includes("could not map"))).toEqual([]);
    expect(proposal?.candidates).toHaveLength(values.length);
    for (const candidate of proposal?.candidates ?? []) expect(candidate).not.toHaveProperty("expectedState");
    const graph = await approvedGraph(service, projectId, proposal!.proposalId);
    expect(graph.nodes).toHaveLength(values.length);
    for (const node of graph.nodes) expect(node.parameterValues).not.toHaveProperty("expectedState");
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
