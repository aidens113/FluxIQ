// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IoRegistry } from "../../../../../../io/index.ts";
import type { AppendRecordingEntryInput } from "../../../../model/index.ts";
import type { AutomationStudioImporterSdkManifest, AutomationStudioRecordingMapperObservation } from "../../../../nodes/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { AutomationStudioService } from "../../../service.ts";

// Heavy service test: under full-suite load it ran past the 15 s default (t289).
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// B0: the gap between two recorded steps, carried onto the later proposal
// candidate by the real recording path. It runs through
// `AutomationStudioService` because the service is the only place the
// recording's clock and the candidates meet. The half that approved the proposal
// into a Flow and ran it was removed in t545: t519 retired that approval. The
// executor's use of the ceiling is covered in `executor/tests/ladder-run.test.ts`.

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

it("carries the recorded gap between two recorded steps onto the later candidate", async () => {
  const { service, projectId } = await projectWithClickMapper();
  const recording = await service.createRecording({ description: "Shows the steps the automation repeats.", projectId, recordingId: "recording.gap", domainId: "example", initialState: { timestamp: 1, namespaces: {} } });
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
});
