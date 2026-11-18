// Covers handlers/across-projects.ts: the cross-project run and Flow reads Home uses in place of one call per project.

import { describe, expect, it, vi } from "vitest";

import { GlobalProgramApiRegistry } from "../../../../../_shared/api.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../../../api-contracts/automation.ts";
import type { AutomationStudioService } from "../../../../../../framework/automation-service/index.ts";
import { cacheActor } from "../../tests/test-actor.ts";
import { registerAutomationStudioApi } from "../../index.ts";

function fakeService() {
  const listProjects = vi.fn().mockResolvedValue({ categories: [], projects: [{ id: "p1" }, { id: "p2" }] });
  const listFlowRunSummaries = vi.fn(async (input: { projectId: string }) => ({
    runs: [{ runId: `run.${input.projectId}`, flowId: "f", projectId: "ignored", status: "succeeded", updatedAt: 1 }],
    total: 1, limit: 100, offset: 0
  }));
  const listAutomationFlowSummaries = vi.fn(async (projectId: string) => [{ flowId: `flow.${projectId}`, name: `Flow of ${projectId}` }]);
  const service = { listProjects, listFlowRunSummaries, listAutomationFlowSummaries } as unknown as AutomationStudioService;
  return { service, listProjects, listFlowRunSummaries, listAutomationFlowSummaries };
}

const actor = { ...cacheActor("user.reader"), permissions: ["programs.read" as const] };

describe("across-project reads", () => {
  it("registers both under programs.read", () => {
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, {} as AutomationStudioService);
    for (const endpoint of [AUTOMATION_STUDIO_ENDPOINTS.listRecentFlowRuns, AUTOMATION_STUDIO_ENDPOINTS.listWorkspaceFlowSummaries]) {
      expect(registry.endpoints()).toContainEqual(expect.objectContaining({ programId: "automation-studio", endpoint, permission: "programs.read", classification: "read" }));
    }
  });

  it("answers the newest runs of every listed project in one call, each naming its project", async () => {
    const { service, listProjects, listFlowRunSummaries } = fakeService();
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, service);
    const response = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.listRecentFlowRuns, scope: { domainId: "web-automation" }, actor, payload: {} });
    expect(listProjects).toHaveBeenCalledWith("web-automation");
    expect(listFlowRunSummaries).toHaveBeenCalledWith({ projectId: "p1", limit: 200, sort: "started", direction: "desc" });
    expect(response).toMatchObject({ ok: true, payload: { runs: [
      { runId: "run.p1", projectId: "p1", durableBehaviorChanged: false },
      { runId: "run.p2", projectId: "p2", durableBehaviorChanged: false }
    ] } });
  });

  it("answers the Flows of every listed project, each naming its project", async () => {
    const { service } = fakeService();
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, service);
    const response = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.listWorkspaceFlowSummaries, scope: {}, actor, payload: {} });
    expect(response).toMatchObject({ ok: true, payload: { flows: [
      { flowId: "flow.p1", name: "Flow of p1", projectId: "p1" },
      { flowId: "flow.p2", name: "Flow of p2", projectId: "p2" }
    ] } });
  });

  it("refuses an actor without programs.read before reading any project", async () => {
    const { service, listProjects } = fakeService();
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, service);
    const response = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.listRecentFlowRuns, scope: {}, actor: { ...cacheActor("user.writer"), permissions: ["programs.write"] }, payload: {} });
    expect(response).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(listProjects).not.toHaveBeenCalled();
  });
});
