import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { IoRegistry } from "../../../../../../io/index.ts";
import type { AppendRecordingEntryInput, AutomationStudioFlowDocument } from "../../../../model/index.ts";
import type { AutomationStudioImporterSdkManifest, AutomationStudioRecordingMapperObservation } from "../../../../nodes/index.ts";
import { runAutomationStudioGraph } from "../../../executor/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AutomationStudioService } from "../../../service.ts";

// B0 end to end: the gap between two recorded steps, carried onto the Flow node
// by the real recording path, and then spent by the real executor as the node's
// wait ceiling.
//
// It runs through `AutomationStudioService` rather than calling the mapping
// module directly, because the service is the only place the recording's clock
// and the candidates meet, and a row that called the module alone could pass
// while nothing invoked it. The `readyState` is added to the node afterwards,
// as an author would: the recording path writes the ceiling but no writer of a
// node's pre-state exists yet, so a purely recorded node still has nothing to
// wait for.

let tempRoot: string;
const services = new Set<AutomationStudioService>();

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-recorded-gap-"));
});

afterEach(async () => {
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

function isClick(observation: AutomationStudioRecordingMapperObservation): boolean {
  return observation.payload.observationType === "clicked";
}

/** One project whose mapper proposes a click for every clicked observation. */
async function projectWithClickMapper(): Promise<{ service: AutomationStudioService; projectId: string }> {
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
    recordingMappers: [{ id: "click-mapper", version: "1.0.0", description: "Clicks", outputIds: ["click"] }]
  };
  let step = 0;
  const runtime = new AutomationStudioNativeNodeRuntime().register(manifest, {
    packageId: "example.importer",
    packageVersion: "1.0.0",
    implementations: {},
    recordingMappers: { "click-mapper": (observation) => isClick(observation) ? { outputId: "click", parameters: { target: `step-${step++}` }, sourceInputIds: ["clicked"], confidence: 0.9 } : null }
  });
  const service = new AutomationStudioService({ dataDir: tempRoot }).bindIoRuntime(io, "example").bindNativeNodeRuntime(runtime);
  services.add(service);
  const project = await service.createProject({ name: "Recorded gap", domainId: "example" });
  return { service, projectId: project.id };
}

it("carries the recorded gap onto the node, and the executor spends it as the wait ceiling", async () => {
  const { service, projectId } = await projectWithClickMapper();
  const recording = await service.createRecording({ projectId, recordingId: "recording.gap", domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
  // Two clicks 4 s apart on the monotonic clock, with an observation between
  // them 200 ms before the second: the gap that matters is the 4 s between the
  // two steps, not the 200 ms since the last entry.
  const entries: AppendRecordingEntryInput[] = [
    { type: "observation", observationType: "clicked", payload: { inputId: "clicked", step: 0 }, monotonicOffsetMs: 0 },
    { type: "observation", observationType: "page", payload: { note: "settled" }, monotonicOffsetMs: 3_800 },
    { type: "observation", observationType: "clicked", payload: { inputId: "clicked", step: 1 }, monotonicOffsetMs: 4_000 }
  ];
  await service.appendRecordingEvents({ projectId, recordingId: recording.recordingId, entries });

  const { proposals: [proposal] } = await service.createRecordingFlowProposals({ projectId, recordingId: recording.recordingId });
  expect(proposal?.candidates).toHaveLength(2);
  expect(proposal?.candidates[0]).not.toHaveProperty("recordedGapMs");
  expect(proposal?.candidates[1]?.recordedGapMs).toBe(4_000);

  const reviewed = await service.reviewRecordingFlowProposal({ projectId, proposalId: proposal!.proposalId, decision: "approved", destination: { kind: "flow", name: "Recorded clicks" } });
  const page = await service.listFlowSubflowSummaries({ projectId, flowId: reviewed.flow!.flowId, role: "primary", limit: 10, offset: 0 });
  const graph = await service.getFlow(projectId, page.subflows[0]!.graphFlowId!);
  expect(graph.nodes).toHaveLength(2);
  expect(graph.nodes[0]?.metadata).not.toHaveProperty("recordedGapMs");
  expect(graph.nodes[1]?.metadata?.recordedGapMs).toBe(4_000);

  // The Flow as authored, with a pre-state on the second node. Nothing else is
  // rewritten: the metadata the recording wrote is what the executor reads.
  const asked: Array<{ nodeId?: string; timeoutMs: number }> = [];
  const document: AutomationStudioFlowDocument = {
    schemaVersion: "0.1",
    flowId: graph.flowId,
    ownerKind: "routine",
    ownerId: "routine.recorded-gap",
    name: "Recorded clicks",
    createdAt: 1,
    updatedAt: 1,
    nodes: graph.nodes.map((node, index) => index === 1 ? { ...node, parameterValues: { ...(node.parameterValues ?? {}), readyState: { conditions: [{ path: "page.ready" }] } } } : node),
    edges: graph.edges
  };
  const trace = await runAutomationStudioGraph(document, {
    effectDispatcher: () => ({ status: "success", route: "success", outputs: {} }),
    hostRuntime: {
      capabilities: ["expectation-evaluation"],
      expectationEvaluator: (_conditions, _mode, timeoutMs, context) => {
        asked.push({ ...(context.nodeId ? { nodeId: context.nodeId } : {}), timeoutMs });
        return { passed: true, checkedConditionCount: 1 };
      }
    }
  });

  // 4 s recorded, doubled, inside the 2 s floor and the 30 s cap.
  expect(asked).toEqual([{ nodeId: graph.nodes[1]!.id, timeoutMs: 8_000 }]);
  expect(trace.attempts.find((attempt) => attempt.nodeId === graph.nodes[1]!.id)?.readiness).toMatchObject({ ceilingMs: 8_000, satisfied: true });
  expect(trace.status).toBe("succeeded");
});
