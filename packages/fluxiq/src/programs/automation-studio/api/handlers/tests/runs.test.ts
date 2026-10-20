// Covers handlers/runs.ts. Starts with export-flow-run-audit, which Runtime
// Debug's Export Audit button calls and reads back as `payload.audit`.

import { describe, expect, it, vi } from "vitest";

import { GlobalProgramApiRegistry } from "../../../../_shared/api.ts";

import { AUTOMATION_STUDIO_ENDPOINTS } from "../../contracts.ts";
import type { AutomationStudioService } from "../../../runtime/index.ts";
import { AutomationStudioFlowBootstrapCreationSpendStore, AutomationStudioFlowPaths, AutomationStudioProjectPaths, type AutomationStudioProjectStore } from "../../../runtime/service/index.ts";
import { cacheActor } from "./test-actor.ts";
import { createCacheApiTestService } from "./test-service.ts";
import { registerAutomationStudioApi } from "../index.ts";

// Heavy service test: under full-suite load it ran past the 15 s default (t289).
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

async function runOneDeterministicFlow(service: AutomationStudioService, projectId: string): Promise<string> {
  const flow = await service.createFlow({ projectId, flowId: "flow.audit-export", name: "Audit Export Flow" });
  const subflow = await service.createFlowSubflow({ projectId, flowId: flow.flowId, name: "Primary", role: "primary" });
  if (!subflow.graphFlowId) throw new Error("Expected the primary Subflow to own a graph Flow.");
  const blankGraph = await service.getFlow(projectId, subflow.graphFlowId);
  const graph: { nodes: any[]; edges: any[] } = {
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
  await service.saveFlow({ projectId, flow: { ...blankGraph, ...graph } });
  await service.setFlowMapFallback({ projectId, flowId: flow.flowId, kind: "subflow", targetSubflowId: subflow.subflowId });
  await service.saveFlowGenerationInstruction({ projectId, flowId: flow.flowId, instruction: "Produce the constant value once." });
  const run = await service.runRuntimeSession({ projectId, flowId: flow.flowId, adaptiveMode: "deterministic" });
  return run.runId;
}

describe("Automation Studio run audit export API", () => {
  it("registers export-flow-run-audit under programs.read", () => {
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, {} as AutomationStudioService);
    expect(registry.endpoints()).toContainEqual({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.exportFlowRunAudit,
      permission: "programs.read",
      classification: "read"
    });
  });

  it("forwards projectId and runId to the service and answers { audit }", async () => {
    const audit = { schemaVersion: "0.1", runId: "run.one", projectId: "project.one" };
    const exportFlowRunAudit = vi.fn().mockResolvedValue(audit);
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, { exportFlowRunAudit } as unknown as AutomationStudioService);

    const response = await registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.exportFlowRunAudit,
      scope: {},
      actor: { ...cacheActor("user.reader"), permissions: ["programs.read"] },
      payload: { projectId: "project.one", runId: "run.one" }
    });

    expect(response).toEqual({ ok: true, payload: { audit } });
    expect(exportFlowRunAudit).toHaveBeenCalledTimes(1);
    expect(exportFlowRunAudit).toHaveBeenCalledWith("project.one", "run.one");
  });

  it("refuses an actor without programs.read before the service is called", async () => {
    const exportFlowRunAudit = vi.fn().mockResolvedValue({});
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, { exportFlowRunAudit } as unknown as AutomationStudioService);

    const response = await registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.exportFlowRunAudit,
      scope: {},
      actor: { ...cacheActor("user.writer"), permissions: ["programs.write", "flows.write"] },
      payload: { projectId: "project.one", runId: "run.one" }
    });

    expect(response).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(exportFlowRunAudit).not.toHaveBeenCalled();
  });

  it("exports a real run's audit and answers { audit: null } for an unknown run", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    try {
      const project = await service.createProject({ name: "Run audit API" });
      const runId = await runOneDeterministicFlow(service, project.id);
      const registry = new GlobalProgramApiRegistry();
      registerAutomationStudioApi(registry, service);
      const actor = { ...cacheActor("user.reader"), permissions: ["programs.read" as const] };

      const exported = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.exportFlowRunAudit,
        scope: {},
        actor,
        payload: { projectId: project.id, runId }
      });
      expect(exported.ok).toBe(true);
      expect(exported.payload).toMatchObject({
        audit: {
          schemaVersion: "0.1",
          projectId: project.id,
          runId,
          manifest: { adaptationCount: 0 },
          integrity: { algorithm: "sha256", runDetailHash: expect.stringMatching(/^[a-f0-9]{64}$/) },
          runDetail: { summary: { runId } },
          retention: { rawPromptsRetained: false, compactContextRetained: true, sensitiveValuesRedacted: true }
        }
      });

      const unknown = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.exportFlowRunAudit,
        scope: {},
        actor,
        payload: { projectId: project.id, runId: "run.missing" }
      });
      expect(unknown).toEqual({ ok: true, payload: { audit: null } });
    } finally {
      await cleanup();
    }
  });
});

describe("list-flow-runs durableBehaviorChanged", () => {
  it("answers a boolean on every run, false for a summary saved before the field existed", async () => {
    const summaries = [
      { runId: "run.changed", flowId: "flow.one", durableBehaviorChanged: true },
      { runId: "run.unchanged", flowId: "flow.one", durableBehaviorChanged: false },
      { runId: "run.older", flowId: "flow.one" }
    ];
    const listFlowRunSummaries = vi.fn(async () => ({ runs: summaries, total: 3, limit: 25, offset: 0 }));
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, { listFlowRunSummaries } as unknown as AutomationStudioService);

    const response = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowRuns, scope: {}, actor: cacheActor("user.runs"), payload: { projectId: "project.one", flowId: "flow.one" } });

    const expected = [
      { runId: "run.changed", flowId: "flow.one", durableBehaviorChanged: true },
      { runId: "run.unchanged", flowId: "flow.one", durableBehaviorChanged: false },
      { runId: "run.older", flowId: "flow.one", durableBehaviorChanged: false }
    ];
    expect(response).toEqual({ ok: true, payload: { runs: expected, page: { runs: expected, total: 3, limit: 25, offset: 0 } } });
    expect(listFlowRunSummaries).toHaveBeenCalledWith({ projectId: "project.one", flowId: "flow.one", limit: undefined, offset: undefined });
  });
});

// t728: a Flow's spend, as its Lab-scoped Flow purse recorded it, read-only.
describe("get-flow-spend", () => {
  function memoryStore(): AutomationStudioFlowBootstrapCreationSpendStore {
    const projectPaths = new AutomationStudioProjectPaths(undefined);
    return new AutomationStudioFlowBootstrapCreationSpendStore(projectPaths, new AutomationStudioFlowPaths(projectPaths), { ensureProjectStructure: async () => undefined } as unknown as AutomationStudioProjectStore);
  }
  function readerOf(creationSpends: AutomationStudioFlowBootstrapCreationSpendStore) {
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, { creationSpends } as unknown as AutomationStudioService);
    return (flowId: string) => registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowSpend, scope: {}, actor: cacheActor("user.reader"), payload: { projectId: "project.one", flowId } });
  }

  it("answers null for a Flow with no record, and the itemised record for one with", async () => {
    const creationSpends = memoryStore();
    const read = readerOf(creationSpends);
    expect(await read("flow.one")).toEqual({ ok: true, payload: { spend: null } });
    await creationSpends.add("project.one", "flow.one", 0.002, { phase: "chat", calls: 1 });
    await creationSpends.add("project.one", "flow.one", 0.01, { phase: "judge", calls: 1 });
    const answered = await read("flow.one");
    expect(answered).toMatchObject({
      ok: true,
      payload: {
        spend: {
          projectId: "project.one",
          flowId: "flow.one",
          spentUsd: 0.012,
          builds: 1,
          calls: 2,
          byPhase: {
            build: { calls: 0, usd: 0 },
            read: { calls: 0, usd: 0 },
            judge: { calls: 1, usd: 0.01 },
            runtime: { calls: 0, usd: 0 },
            reauthor: { calls: 0, usd: 0 },
            chat: { calls: 1, usd: 0.002 }
          }
        }
      }
    });
    expect(Object.keys((answered as { payload: { spend: object } }).payload.spend).sort()).toEqual(["builds", "byPhase", "calls", "createdAt", "flowId", "projectId", "spentUsd", "updatedAt"]);
    expect(await read("flow.other")).toEqual({ ok: true, payload: { spend: null } });
  });

  it("answers an unitemised record with null calls and phases", async () => {
    const creationSpends = memoryStore();
    await creationSpends.save({ kind: "flow_creation_spend", projectId: "project.one", flowId: "flow.one", spentUsd: 0.05, builds: 2, createdAt: 1, updatedAt: 2 });
    expect(await readerOf(creationSpends)("flow.one")).toEqual({ ok: true, payload: { spend: { projectId: "project.one", flowId: "flow.one", spentUsd: 0.05, builds: 2, calls: null, byPhase: null, createdAt: 1, updatedAt: 2 } } });
  });
});
