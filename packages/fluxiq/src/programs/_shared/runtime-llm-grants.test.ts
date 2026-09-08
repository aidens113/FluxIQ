import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createGlobalProgramRuntime } from "../index.ts";
import type { ProgramApiActor } from "./api.ts";

describe("global runtime LLM execution-grant composition", () => {
  it("issues a sanitized build grant against the exact binding and rejects it after settings drift", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-build-grant-"));
    const runtime = createGlobalProgramRuntime(testPaths(root));
    try {
      const login = await runtime.identityAccess.authenticate({ username: "admin", password: "admin" });
      await runtime.identityAccess.setPinAuthorized({
        userId: "admin",
        pin: "1234",
        sessionId: login.session.id,
        authorizationPassword: "admin",
        authorizationPin: undefined,
        authorizationTotp: undefined
      });
      const actor: ProgramApiActor = {
        sessionId: login.session.id,
        userId: login.user.id,
        roleId: login.role.id,
        permissions: login.role.permissions
      };
      const project = await runtime.automationStudio.createProject({ name: "Build grant integration" });
      const flow = await runtime.automationStudio.createFlow({ projectId: project.id, name: "Blank Flow" });
      const key = await runtime.secretKeys.createKey({
        name: "DeepSeek",
        value: "test-provider-secret",
        authorizationPassword: "admin",
        kind: "llm",
        provider: "deepseek",
        scope: "flow",
        scopeRef: flow.flowId,
        metadata: { model: "deepseek-chat" }
      });
      const binding = await runtime.automationStudio.getLlmExecutionBinding(project.id, flow.flowId);
      const issued = await runtime.api.call({
        programId: "automation-studio",
        endpoint: "issue-llm-execution-grant",
        scope: {},
        actor,
        payload: {
          purpose: "build_and_adapt",
          authSessionId: login.session.id,
          authorizationPassword: "admin",
          authorizationPin: "1234",
          keyId: key.id,
          projectId: project.id,
          flowId: flow.flowId,
          maxCalls: 2,
          maxUses: 2,
          maxEstimatedCostUsd: 0.1,
          maxTotalEstimatedCostUsd: 0.2,
          providerRetryCount: 0
        }
      }) as { ok: boolean; payload?: { grant: { grantId: string; purpose: string; executionDigest: string; settingsRevision: number; keyUpdatedAtMs: number } }; error?: string };
      expect(issued.ok, issued.error).toBe(true);
      expect(issued.payload?.grant).toMatchObject({
        purpose: "build_and_adapt",
        executionDigest: binding.executionDigest,
        settingsRevision: binding.settingsRevision,
        keyUpdatedAtMs: key.updatedAtMs
      });
      expect(JSON.stringify(issued)).not.toContain("test-provider-secret");
      expect(JSON.stringify(issued)).not.toContain("1234");

      const current = await runtime.automationStudio.getFlow(project.id, flow.flowId);
      await runtime.automationStudio.saveFlow({
        projectId: project.id,
        flow: { ...current, metadata: { ...(current.metadata ?? {}), trainingMode: "normal" }, updatedAt: current.updatedAt + 1 }
      });
      await expect(runtime.llmExecutionGrants.resolve({
        grantId: issued.payload!.grant.grantId,
        actorUserId: actor.userId,
        actorSessionId: actor.sessionId,
        projectId: project.id,
        flowId: flow.flowId,
        purpose: "build_and_adapt"
      }, { allowedTaskKinds: ["flow_bootstrap"] })).rejects.toThrow("no longer valid");
    } finally {
      await runtime.automationStudio.close();
      runtime.secretKeys.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});

function testPaths(root: string) {
  return {
    root,
    fluxiq: path.join(root, ".fluxiq"),
    config: path.join(root, ".fluxiq", "config"),
    data: path.join(root, ".fluxiq", "data"),
    databases: path.join(root, ".fluxiq", "databases"),
    inputs: path.join(root, ".fluxiq", "inputs"),
    outputs: path.join(root, ".fluxiq", "outputs"),
    streams: path.join(root, ".fluxiq", "streams"),
    domains: path.join(root, ".fluxiq", "domains"),
    domainPrograms: path.join(root, ".fluxiq", "domains", "programs"),
    domainInputs: path.join(root, ".fluxiq", "domains", "inputs"),
    domainOutputs: path.join(root, ".fluxiq", "domains", "outputs"),
    domainConfigs: path.join(root, ".fluxiq", "domains", "configs"),
    domainData: path.join(root, ".fluxiq", "domains", "data"),
    domainDatabases: path.join(root, ".fluxiq", "domains", "databases"),
    recordings: path.join(root, ".fluxiq", "recordings"),
    policies: path.join(root, ".fluxiq", "policies"),
    logs: path.join(root, ".fluxiq", "logs"),
    temp: path.join(root, ".fluxiq", "tmp")
  };
}