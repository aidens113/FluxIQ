// @fluxiq-test-group real-sql
// Whose key pays for a Flow's result checks is not something a client's write decides.
// Through the real endpoints, over stores on disk. Every id here is a dummy.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../api-contracts/automation/index.ts";
import { AutomationStudioService } from "../../../../framework/automation-service/service.ts";
import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../_shared/api.ts";
import { registerAutomationStudioApi } from "../handlers/index.ts";

const NAMED_BY_CLIENT = { authorizedByUserId: "user.someone-else", unlockSessionId: "session.named-by-client", keyId: "key.someone-elses", maxTotalCostUsd: 1, maxCostUsdPerCall: 0.05, grantedAtMs: 1, expiresAtMs: 9_999_999_999_999 };
const STORED = { ...NAMED_BY_CLIENT, authorizedByUserId: "user.owner", unlockSessionId: "session.owner", keyId: "key.own" };
const ACTOR: ProgramApiActor = { userId: "user.owner", sessionId: "session.owner", roleId: "admin", permissions: ["programs.read", "programs.write", "flows.write"] } as ProgramApiActor;

function checkOf(metadata: Record<string, any> | undefined): Record<string, unknown> | undefined {
  return metadata?.trainingModeSettings?.resultCheck;
}

function namingAuthorization(metadata: Record<string, any> | undefined, authorization: unknown): Record<string, any> {
  return { ...metadata, trainingModeSettings: { resultCheck: { enabled: true, authorization } } };
}

describe("a Flow's standing result-check authorization, through the endpoints", () => {
  let root = "";
  let service: AutomationStudioService;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-check-authorization-"));
    service = new AutomationStudioService({ dataDir: path.join(root, ".fluxiq", "data"), seedFixture: false });
  });
  afterEach(async () => {
    await service.close?.();
    await rm(root, { recursive: true, force: true });
  });

  async function flowAndCaller() {
    const project = await service.createProject({ name: "Checks", domainId: "example" });
    const flow = await service.createFlow({ projectId: project.id, flowId: "flow.checks", name: "Checks" });
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, service);
    const call = (endpoint: string, payload: Record<string, unknown>) => registry.call({ programId: "automation-studio", endpoint, scope: {}, actor: ACTOR, payload });
    return { project, flow, call };
  }

  it("is not set by a settings patch", async () => {
    const { project, flow, call } = await flowAndCaller();
    const answer = await call(AUTOMATION_STUDIO_ENDPOINTS.updateFlowSettings, { projectId: project.id, flowId: flow.flowId, flow: { metadata: namingAuthorization({}, NAMED_BY_CLIENT) } });
    expect(answer.error).toBeUndefined();
    expect(checkOf((await service.getFlow(project.id, flow.flowId)).metadata)?.authorization).toBeUndefined();
  });

  it("is not set by saving a whole Flow", async () => {
    const { project, flow, call } = await flowAndCaller();
    const answer = await call(AUTOMATION_STUDIO_ENDPOINTS.saveFlow, { projectId: project.id, flow: { ...flow, metadata: namingAuthorization(flow.metadata, NAMED_BY_CLIENT) } });
    expect(answer.error).toBeUndefined();
    expect(checkOf((await service.getFlow(project.id, flow.flowId)).metadata)?.authorization).toBeUndefined();
  });

  it("stays as stored when a client names another, either way", async () => {
    const { project, flow, call } = await flowAndCaller();
    await service.saveFlow({ projectId: project.id, flow: { ...flow, metadata: namingAuthorization(flow.metadata, STORED) } });
    await call(AUTOMATION_STUDIO_ENDPOINTS.updateFlowSettings, { projectId: project.id, flowId: flow.flowId, flow: { metadata: namingAuthorization({}, NAMED_BY_CLIENT) } });
    expect(checkOf((await service.getFlow(project.id, flow.flowId)).metadata)?.authorization).toMatchObject({ keyId: "key.own" });
    const saved = await service.getFlow(project.id, flow.flowId);
    await call(AUTOMATION_STUDIO_ENDPOINTS.saveFlow, { projectId: project.id, flow: { ...saved, metadata: namingAuthorization(saved.metadata, NAMED_BY_CLIENT) } });
    expect(checkOf((await service.getFlow(project.id, flow.flowId)).metadata)?.authorization).toMatchObject({ keyId: "key.own" });
  });
});
