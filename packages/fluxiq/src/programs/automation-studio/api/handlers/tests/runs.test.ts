// Covers handlers/runs.ts. Starts with export-flow-run-audit, which Runtime
// Debug's Export Audit button calls and reads back as `payload.audit`.

import { describe, expect, it, vi } from "vitest";

import { GlobalProgramApiRegistry } from "../../../../_shared/api.ts";

import { AUTOMATION_STUDIO_ENDPOINTS } from "../../contracts.ts";
import type { AutomationStudioService } from "../../../runtime/index.ts";
import { cacheActor } from "./test-actor.ts";
import { createCacheApiTestService } from "./test-service.ts";
import { registerAutomationStudioApi } from "../index.ts";

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
      permission: "programs.read"
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
