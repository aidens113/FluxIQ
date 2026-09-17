import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationStudioNodeRegistry } from "../../../../nodes/index.ts";
import { validateAutomationStudioFlowBootstrapPlan } from "../../../flow-bootstrap/index.ts";
import { AutomationStudioService } from "../../../service.ts";
import { createRunnableCanonicalFlow } from "../../service-fixtures.ts";

// A run's adaptation context is built from the Flow's history: its recent runs
// (the training budget and the stability score), its recent adaptations, and
// the records of those adaptations (what the known-adaptation gate matches). A
// read that fails must fail the context, and with it the run's start. Read as
// "no history", it resets the budget and hides every known adaptation.

let tempRoot: string;
const services = new Set<AutomationStudioService>();

function createService(): AutomationStudioService {
  const service = new AutomationStudioService({ dataDir: tempRoot, seedFixture: false });
  services.add(service);
  return service;
}

function projectRoot(projectId: string): string {
  return path.join(tempRoot, "programs", "automation-studio", "projects", projectId);
}

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "fluxiq-context-history-"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all([...services].map((service) => service.close()));
  services.clear();
  await rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
});

async function blankFlow(service: AutomationStudioService) {
  const project = await service.createProject({ name: "Context history" });
  const flow = await service.createFlow({ projectId: project.id, flowId: "flow.context-history", name: "Context history" });
  return { projectId: project.id, flow };
}

// A bootstrap adaptation is listed with the Flow's adaptations and loaded as a record.
async function flowWithOneAdaptation(service: AutomationStudioService) {
  const { projectId, flow } = await blankFlow(service);
  const now = Date.now();
  await service.saveFlowInstruction(projectId, {
    schemaVersion: "0.1",
    instructionId: "instruction.active",
    title: "Build a deterministic Flow",
    body: "Create a primary path from Start to End.",
    scope: { kind: "flow", projectId, flowId: flow.flowId },
    priority: 100,
    status: "active",
    requirement: "required",
    createdAt: now,
    updatedAt: now
  });
  const plan = validateAutomationStudioFlowBootstrapPlan({
    plan: {
      schemaVersion: "0.1",
      router: { name: "Instruction router", rules: [], fallback: { kind: "subflow", targetSubflowKey: "primary" } },
      subflows: [{
        key: "primary",
        name: "Primary",
        role: "primary",
        nodes: [
          { key: "start", definitionId: "builtin.control.start", definitionVersion: "1.0.0" },
          { key: "end", definitionId: "builtin.control.end", definitionVersion: "1.0.0" }
        ],
        edges: [{ key: "start_end", source: { nodeKey: "start", portId: "success" }, target: { nodeKey: "end", portId: "in" } }]
      }]
    },
    registry: new AutomationStudioNodeRegistry(),
    resolution: { scope: { kind: "global" }, runtimeCapabilities: [], permissions: [] }
  });
  if (!plan.validated) throw new Error(JSON.stringify(plan.issues));
  const adaptation = await service.createFlowBootstrapAdaptation({
    projectId,
    flowId: flow.flowId,
    baseDependencyDigest: await service.getLlmExecutionDependencyDigest(projectId, flow.flowId),
    sourceInstructionIds: ["instruction.active"],
    summary: "Build the requested deterministic Flow.",
    buildPlan: plan.validated
  });
  return { projectId, flow, adaptationId: adaptation.adaptationId };
}

describe("the history a run's adaptation context reads", () => {
  it("fails when the run listing cannot be read, instead of counting no prior runs", async () => {
    const service = createService();
    const { projectId, flow } = await blankFlow(service);
    await expect(service.resolveRuntimeAdaptationContext({ projectId, flow })).resolves.toMatchObject({ runsCompleted: 0 });

    const indexFile = path.join(projectRoot(projectId), "indexes", "runs.json");
    await mkdir(path.dirname(indexFile), { recursive: true });
    await writeFile(indexFile, "{ this is not json", "utf8");

    await expect(service.resolveRuntimeAdaptationContext({ projectId, flow })).rejects.toThrow(/Program state is malformed/);
  });

  it("fails when the adaptation listing cannot be read, instead of counting no adaptations", async () => {
    const service = createService();
    const { projectId, flow } = await blankFlow(service);
    await expect(service.resolveRuntimeAdaptationContext({ projectId, flow })).resolves.toMatchObject({ recentAdaptationCount: 0 });

    // Where the Flow's bootstrap adaptations are listed from, but not a directory.
    await writeFile(path.join(projectRoot(projectId), "flows", flow.flowId, "adaptations"), "not a directory", "utf8");

    await expect(service.resolveRuntimeAdaptationContext({ projectId, flow })).rejects.toMatchObject({ code: "ENOTDIR" });
  });

  it("fails when a listed adaptation's record cannot be read, instead of leaving it out", async () => {
    const service = createService();
    const { projectId, flow, adaptationId } = await flowWithOneAdaptation(service);
    const context = await service.resolveRuntimeAdaptationContext({ projectId, flow });
    expect(context.recentAdaptationCount).toBe(1);
    expect(context.recentAdaptations.map((adaptation) => adaptation.adaptationId)).toEqual([adaptationId]);

    vi.spyOn(service, "getFlowAdaptation").mockRejectedValue(new Error("database disk image is malformed"));

    await expect(service.resolveRuntimeAdaptationContext({ projectId, flow })).rejects.toThrow("database disk image is malformed");
  });

  it("skips a listed adaptation whose record is absent", async () => {
    const service = createService();
    const { projectId, flow } = await flowWithOneAdaptation(service);
    vi.spyOn(service, "getFlowAdaptation").mockResolvedValue(null);

    await expect(service.resolveRuntimeAdaptationContext({ projectId, flow })).resolves.toMatchObject({ recentAdaptationCount: 1, recentAdaptations: [] });
  });

  it("fails a run's start when its history cannot be read", async () => {
    const service = createService();
    const project = await service.createProject({ name: "Run start" });
    const flow = await createRunnableCanonicalFlow(service, project.id, { flowId: "flow.run-start-history" });
    vi.spyOn(service, "listFlowRunSummaries").mockRejectedValue(new Error("database is locked"));

    await expect(service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId })).rejects.toThrow("database is locked");
  });
});
