import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../_shared/api.ts";
import { AutomationStudioService } from "../runtime/service.ts";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService } from "../../../client-gateway/index.ts";

import { AUTOMATION_STUDIO_ENDPOINTS, AUTOMATION_STUDIO_FLOW_BOOTSTRAP_GENERATION_READINESS, AUTOMATION_STUDIO_NORMAL_EDITOR_GRAPH_WRITE_ENDPOINT, assertAutomationStudioNormalEditorGraphEndpoint, parseAutomationStudioFlowBootstrapGenerationReadiness } from "./contracts.ts";
import { assertFlowLlmExecutionSettings, flowInstructionScopeFromPayload, registerAutomationStudioApi } from "./handlers.ts";

const base = { projectId: "project.one", flowId: "flow.one", title: "Rule", body: "Apply it" };

function readyLlmApiService<T extends object>(service: T): T & { getFlowBootstrapGenerationRuntimeReadiness(): { providerResolverConfigured: true; nativeNodeRegistryConfigured: true } } {
  return Object.assign({
    getFlowBootstrapGenerationRuntimeReadiness: () => ({ providerResolverConfigured: true as const, nativeNodeRegistryConfigured: true as const })
  }, service);
}

describe("Flow LLM execution settings API validation", () => {
  const valid = {
    llmProvider: "deepseek",
    llmModel: "deepseek-chat",
    llmExecutionSettings: {
      tokenLimits: { maxInputTokens: 8000, maxOutputTokens: 2000, maxTotalTokens: 10000 },
      maxCalls: 1,
      timeoutMs: 20000,
      maxEstimatedCostUsd: 0.25,
      retryCount: 0
    }
  };

  it("accepts bounded diagnosis-only settings", () => {
    expect(() => assertFlowLlmExecutionSettings(valid)).not.toThrow();
  });

  it("rejects unsupported providers, oversized totals, calls, retries, timeout, and cost", () => {
    expect(() => assertFlowLlmExecutionSettings({ ...valid, llmProvider: "openai" })).toThrow(/DeepSeek/);
    expect(() => assertFlowLlmExecutionSettings({ ...valid, llmExecutionSettings: { ...valid.llmExecutionSettings, tokenLimits: { ...valid.llmExecutionSettings.tokenLimits, maxTotalTokens: 50001 } } })).toThrow(/limit/);
    expect(() => assertFlowLlmExecutionSettings({ ...valid, llmExecutionSettings: { ...valid.llmExecutionSettings, maxCalls: 2 } })).toThrow(/exactly one/);
    expect(() => assertFlowLlmExecutionSettings({ ...valid, llmExecutionSettings: { ...valid.llmExecutionSettings, retryCount: 1 } })).toThrow(/retries/);
    expect(() => assertFlowLlmExecutionSettings({ ...valid, llmExecutionSettings: { ...valid.llmExecutionSettings, timeoutMs: 25001 } })).toThrow(/limit/);
    expect(() => assertFlowLlmExecutionSettings({ ...valid, llmExecutionSettings: { ...valid.llmExecutionSettings, maxEstimatedCostUsd: 0.26 } })).toThrow(/cost/);
  });
});
describe("flowInstructionScopeFromPayload", () => {
  it("exposes a bounded development performance snapshot endpoint", () => {
    expect(AUTOMATION_STUDIO_ENDPOINTS.performanceMetrics).toBe("get-performance-metrics");
  });
  it("exposes graph patch endpoints as the normal editor write API", () => {
    expect(AUTOMATION_STUDIO_ENDPOINTS.getGraphViewport).toBe("get-graph-viewport");
    expect(AUTOMATION_STUDIO_ENDPOINTS.applyGraphPatch).toBe("apply-graph-patch");
    expect(AUTOMATION_STUDIO_ENDPOINTS.listGraphRevisions).toBe("list-graph-revisions");
    expect(AUTOMATION_STUDIO_ENDPOINTS.createGraphSnapshot).toBe("create-graph-snapshot");
    expect(AUTOMATION_STUDIO_ENDPOINTS.restoreGraphSnapshot).toBe("restore-graph-snapshot");
    expect(AUTOMATION_STUDIO_NORMAL_EDITOR_GRAPH_WRITE_ENDPOINT).toBe(AUTOMATION_STUDIO_ENDPOINTS.applyGraphPatch);
    expect(() => assertAutomationStudioNormalEditorGraphEndpoint(AUTOMATION_STUDIO_ENDPOINTS.saveFlow)).toThrow(/full Flow document/);
    expect(() => assertAutomationStudioNormalEditorGraphEndpoint(AUTOMATION_STUDIO_ENDPOINTS.applyGraphPatch)).not.toThrow();
  });
  it("exposes cursor-based hierarchy and project change-feed endpoints", () => {
    expect(AUTOMATION_STUDIO_ENDPOINTS.listProjectHierarchyChildren).toBe("list-project-hierarchy-children");
    expect(AUTOMATION_STUDIO_ENDPOINTS.listProjectChangeFeed).toBe("list-project-change-feed");
  });
  it("exposes ordered runtime event pages for Runtime Debug", () => {
    expect(AUTOMATION_STUDIO_ENDPOINTS.listFlowRunEvents).toBe("list-flow-run-events");
  });
  it("preserves global and project scopes", () => {
    expect(flowInstructionScopeFromPayload("project.one", "flow.one", { ...base, scopeKind: "global" })).toEqual({ kind: "global" });
    expect(flowInstructionScopeFromPayload("project.one", "flow.one", { ...base, scopeKind: "project" })).toEqual({ kind: "project", projectId: "project.one" });
  });

  it("preserves named Router, Subflow, node, error, and review targets", () => {
    expect(flowInstructionScopeFromPayload("project.one", "flow.one", { ...base, scopeKind: "router", routerId: "router.one" })).toMatchObject({ kind: "router", routerId: "router.one" });
    expect(flowInstructionScopeFromPayload("project.one", "flow.one", { ...base, scopeKind: "subflow", subflowId: "subflow.one" })).toMatchObject({ kind: "subflow", subflowId: "subflow.one" });
    expect(flowInstructionScopeFromPayload("project.one", "flow.one", { ...base, scopeKind: "node", nodeId: "node.one", subflowId: "subflow.one" })).toMatchObject({ kind: "node", nodeId: "node.one", subflowId: "subflow.one" });
    expect(flowInstructionScopeFromPayload("project.one", "flow.one", { ...base, scopeKind: "on_error", nodeId: "node.one" })).toMatchObject({ kind: "on_error", nodeId: "node.one" });
    expect(flowInstructionScopeFromPayload("project.one", "flow.one", { ...base, scopeKind: "adaptation_review", subflowId: "subflow.one" })).toMatchObject({ kind: "adaptation_review", subflowId: "subflow.one" });
  });
});


describe("Automation Studio instruction readiness API", () => {
  it("forwards a bounded active-only instruction summary query", async () => {
    const listFlowInstructionSummaries = vi.fn().mockResolvedValue({
      instructions: [{ instructionId: "instruction.active", status: "active" }],
      total: 1,
      limit: 1,
      offset: 0
    });
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, { listFlowInstructionSummaries } as any);
    const response = await registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowInstructions,
      scope: {},
      actor: { sessionId: "session.readiness", userId: "user.readiness", roleId: "admin", permissions: ["programs.read"] },
      payload: { projectId: "project.one", flowId: "flow.one", status: "active", limit: 1, offset: 0 }
    });
    expect(listFlowInstructionSummaries).toHaveBeenCalledWith({ projectId: "project.one", flowId: "flow.one", status: "active", limit: 1, offset: 0 });
    expect(response).toMatchObject({ ok: true, payload: { instructions: [{ instructionId: "instruction.active", status: "active" }], page: { total: 1, limit: 1, offset: 0 } } });
  });
});
async function createCacheApiTestService(): Promise<{ service: AutomationStudioService; dataDir: string; cleanup: () => Promise<void> }> {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-automation-cache-api-"));
  const dataDir = path.join(rootDir, ".fluxiq", "data");
  const service = new AutomationStudioService({ dataDir, seedFixture: false });
  return {
    service,
    dataDir,
    cleanup: async () => {
      await service.close();
      await rm(rootDir, { recursive: true, force: true });
    }
  };
}
const cacheActor = (userId: string): ProgramApiActor => ({
  sessionId: `session.${userId}`,
  userId,
  roleId: "admin",
  permissions: ["programs.read", "programs.write"]
});

describe("Automation Studio LLM execution API", () => {
  it("issues an opaque grant with actor/session binding and forwards diagnosis-only intent", async () => {
    const runRuntimeSession = vi.fn().mockResolvedValue({ runId: "run.one", status: "failed" });
    const grants = {
      preflight: vi.fn().mockResolvedValue({ provider: "deepseek", model: "deepseek-chat", keyId: "secret:key" }),
      issue: vi.fn().mockResolvedValue({ grantId: "llm-grant:one", provider: "deepseek", model: "deepseek-chat", remainingUses: 1 }),
      revoke: vi.fn()
    };
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, { runRuntimeSession, getFlowRunDetail: vi.fn().mockResolvedValue(null) } as any, undefined, undefined, undefined, grants as any);
    const actor: ProgramApiActor = { sessionId: "session.one", userId: "user.one", roleId: "admin", permissions: ["runtime.control"] };
    const preflight = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.preflightLlmExecution, scope: {}, actor, payload: { keyId: "secret:key", projectId: "project.one", flowId: "flow.one", tokenLimits: { maxInputTokens: 4000, maxOutputTokens: 1000, maxTotalTokens: 5000 }, maxCalls: 1, maxEstimatedCostUsd: 0.1, timeoutMs: 10000 } });
    expect(preflight.ok).toBe(true);
    expect(grants.preflight).toHaveBeenCalledWith(expect.objectContaining({ tokenLimits: { maxInputTokens: 4000, maxOutputTokens: 1000, maxTotalTokens: 5000 }, maxCalls: 1, maxEstimatedCostUsd: 0.1, timeoutMs: 10000 }));
    const issued = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.issueLlmExecutionGrant, scope: {}, actor, payload: { authSessionId: "session.one", authorizationPassword: "password", authorizationPin: "123456", keyId: "secret:key", projectId: "project.one", flowId: "flow.one", tokenLimits: { maxInputTokens: 4000, maxOutputTokens: 1000, maxTotalTokens: 5000 }, maxCalls: 1, maxEstimatedCostUsd: 0.1, timeoutMs: 10000 } });
    expect(issued).toMatchObject({ ok: true, payload: { grant: { grantId: "llm-grant:one" } } });
    expect(grants.issue).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: "user.one", actorSessionId: "session.one", tokenLimits: { maxInputTokens: 4000, maxOutputTokens: 1000, maxTotalTokens: 5000 }, maxCalls: 1, maxEstimatedCostUsd: 0.1, timeoutMs: 10000 }));
    const run = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.runRuntimeSession, scope: {}, actor, payload: { projectId: "project.one", flowId: "flow.one", runIntent: "diagnosis_only", llmExecutionGrantId: "llm-grant:one" } });
    expect(run.ok).toBe(true);
    expect(runRuntimeSession).toHaveBeenCalledWith(expect.objectContaining({ llmExecution: { grantId: "llm-grant:one", actorUserId: "user.one", actorSessionId: "session.one", purpose: "diagnosis_only" } }));
    expect(runRuntimeSession).toHaveBeenCalledWith(expect.not.objectContaining({ runId: expect.anything() }));
    const staged = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.runRuntimeSession, scope: {}, actor, payload: { projectId: "project.one", flowId: "flow.one", runId: "run.staged", runIntent: "diagnosis_only", llmExecutionGrantId: "llm-grant:staged" } });
    expect(staged).toMatchObject({ ok: false, error: expect.stringContaining("fresh runtime session") });
    expect(grants.revoke).toHaveBeenCalledWith("llm-grant:staged");
    const emptyRunId = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.runRuntimeSession, scope: {}, actor, payload: { projectId: "project.one", flowId: "flow.one", runId: "", runIntent: "diagnosis_only", llmExecutionGrantId: "llm-grant:empty-run-id" } });
    expect(emptyRunId).toMatchObject({ ok: false, error: expect.stringContaining("fresh runtime session") });
    expect(grants.revoke).toHaveBeenCalledWith("llm-grant:empty-run-id");
    expect(runRuntimeSession).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(issued)).not.toContain("password");
  });

  it("threads bounded build_and_adapt authorization fields without exposing credentials", async () => {
    const grants = {
      preflight: vi.fn().mockResolvedValue({ purpose: "build_and_adapt", executionDigest: "digest.one", settingsRevision: 3, keyUpdatedAtMs: 4, maxCalls: 2, maxTotalEstimatedCostUsd: 0.2 }),
      issue: vi.fn().mockResolvedValue({ grantId: "llm-grant:build", purpose: "build_and_adapt", executionDigest: "digest.one", settingsRevision: 3, keyUpdatedAtMs: 4, remainingUses: 2 }),
      revoke: vi.fn()
    };
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, readyLlmApiService({}) as any, undefined, undefined, undefined, grants as any);
    const actor: ProgramApiActor = { sessionId: "session.one", userId: "user.one", roleId: "admin", permissions: ["runtime.control"] };
    const limits = { purpose: "build_and_adapt", keyId: "secret:key", projectId: "project.one", flowId: "flow.one", maxCalls: 2, maxEstimatedCostUsd: 0.1, maxTotalEstimatedCostUsd: 0.2, providerRetryCount: 0 };
    const preflight = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.preflightLlmExecution, scope: {}, actor, payload: limits });
    expect(preflight).toMatchObject({ ok: true, payload: { preflight: { purpose: "build_and_adapt", settingsRevision: 3, maxTotalEstimatedCostUsd: 0.2 } } });
    expect(grants.preflight).toHaveBeenCalledWith(expect.objectContaining(limits));
    const issued = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.issueLlmExecutionGrant, scope: {}, actor, payload: { ...limits, authSessionId: "session.one", authorizationPassword: "private-password", authorizationPin: "654321", maxUses: 2 } });
    expect(issued).toMatchObject({ ok: true, payload: { grant: { grantId: "llm-grant:build", purpose: "build_and_adapt", settingsRevision: 3 } } });
    expect(grants.issue).toHaveBeenCalledWith(expect.objectContaining({ purpose: "build_and_adapt", actorUserId: "user.one", actorSessionId: "session.one", maxCalls: 2, maxTotalEstimatedCostUsd: 0.2, providerRetryCount: 0, maxUses: 2 }));
    expect(JSON.stringify({ preflight, issued })).not.toContain("private-password");
    expect(JSON.stringify({ preflight, issued })).not.toContain("654321");
  });

  it("rejects build grants carrying existing-runtime flags before grant issue", async () => {
    const grants = { preflight: vi.fn(), issue: vi.fn(), revoke: vi.fn() };
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, readyLlmApiService({}) as any, undefined, undefined, undefined, grants as any);
    const actor: ProgramApiActor = { sessionId: "session.one", userId: "user.one", roleId: "admin", permissions: ["runtime.control"] };
    const base = { purpose: "build_and_adapt", keyId: "secret:key", projectId: "project.one", flowId: "flow.one" };
    await expect(registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.preflightLlmExecution, scope: {}, actor, payload: { ...base, runId: "run.stale" } })).resolves.toMatchObject({ ok: false, error: expect.stringContaining("fresh execution session") });
    await expect(registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.issueLlmExecutionGrant, scope: {}, actor, payload: { ...base, authSessionId: "session.one", authorizationPassword: "private-password", authorizationPin: "654321", authorizedExternalSideEffects: true } })).resolves.toMatchObject({ ok: false, error: expect.stringContaining("fresh execution session") });
    expect(grants.preflight).not.toHaveBeenCalled();
    expect(grants.issue).not.toHaveBeenCalled();
  });

  it("returns sanitized failures for unknown purpose and stale dependency/settings binding", async () => {
    const grants = {
      preflight: vi.fn().mockRejectedValue(new Error("LLM execution grant purpose is unsupported.")),
      issue: vi.fn().mockRejectedValue(new Error("Flow or settings changed during grant authorization.")),
      revoke: vi.fn()
    };
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, readyLlmApiService({}) as any, undefined, undefined, undefined, grants as any);
    const actor: ProgramApiActor = { sessionId: "session.one", userId: "user.one", roleId: "admin", permissions: ["runtime.control"] };
    const unknown = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.preflightLlmExecution, scope: {}, actor, payload: { purpose: "unbounded_build", keyId: "secret:key", projectId: "project.one", flowId: "flow.one" } });
    expect(unknown).toEqual({ ok: false, error: "LLM execution grant purpose is unsupported." });
    const stale = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.issueLlmExecutionGrant, scope: {}, actor, payload: { purpose: "build_and_adapt", authSessionId: "session.one", authorizationPassword: "private-password", authorizationPin: "654321", keyId: "secret:key", projectId: "project.one", flowId: "flow.one" } });
    expect(stale).toEqual({ ok: false, error: "Flow or settings changed during grant authorization." });
    expect(JSON.stringify({ unknown, stale })).not.toContain("private-password");
    expect(JSON.stringify({ unknown, stale })).not.toContain("654321");
  });

  it("reports exact Flow Bootstrap capabilities from provider-free runtime wiring without grants, secrets, or providers", async () => {
    const runtimeReadiness = vi.fn().mockReturnValue({ providerResolverConfigured: true, nativeNodeRegistryConfigured: true });
    const service = new Proxy({}, {
      get: (_target, property) => property === "getFlowBootstrapGenerationRuntimeReadiness"
        ? runtimeReadiness
        : (() => { throw new Error(`readiness accessed forbidden service property ${String(property)}`); })()
    });
    const forbiddenGrants = new Proxy({}, { get: () => { throw new Error("readiness accessed grant service"); } });
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, service as any, undefined, undefined, undefined, forbiddenGrants as any);
    const actor: ProgramApiActor = { sessionId: "session.one", userId: "user.one", roleId: "admin", permissions: ["programs.read"] };

    await expect(registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowBootstrapGenerationReadiness,
      scope: {},
      actor,
      payload: {}
    })).resolves.toEqual({ ok: true, payload: { readiness: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_GENERATION_READINESS } });
    expect(runtimeReadiness).toHaveBeenCalledTimes(1);

    const unavailableRegistry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(unavailableRegistry, {
      getFlowBootstrapGenerationRuntimeReadiness: vi.fn().mockReturnValue({ providerResolverConfigured: false, nativeNodeRegistryConfigured: false })
    } as any);
    await expect(unavailableRegistry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowBootstrapGenerationReadiness,
      scope: {},
      actor,
      payload: {}
    })).resolves.toMatchObject({ ok: true, payload: { readiness: {
      supported: false,
      runtime: { llmExecutionGrantsConfigured: false, providerResolverConfigured: false, nativeNodeRegistryConfigured: false }
    } } });

    await expect(registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowBootstrapGenerationReadiness,
      scope: {},
      actor,
      payload: { projectId: "not-accepted" }
    })).resolves.toEqual({ ok: false, error: "Flow bootstrap readiness does not accept request fields." });
    expect(parseAutomationStudioFlowBootstrapGenerationReadiness(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_GENERATION_READINESS)).toEqual(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_GENERATION_READINESS);
    expect(parseAutomationStudioFlowBootstrapGenerationReadiness({ ...AUTOMATION_STUDIO_FLOW_BOOTSTRAP_GENERATION_READINESS, contractVersion: "automation-studio.flow-bootstrap-generation-readiness.v2" })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapGenerationReadiness({ ...AUTOMATION_STUDIO_FLOW_BOOTSTRAP_GENERATION_READINESS, secretKeyId: "forbidden" })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapGenerationReadiness({ ...AUTOMATION_STUDIO_FLOW_BOOTSTRAP_GENERATION_READINESS, runtime: { ...AUTOMATION_STUDIO_FLOW_BOOTSTRAP_GENERATION_READINESS.runtime, providerResolverConfigured: "yes" } })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapGenerationReadiness({ ...AUTOMATION_STUDIO_FLOW_BOOTSTRAP_GENERATION_READINESS, runtime: { ...AUTOMATION_STUDIO_FLOW_BOOTSTRAP_GENERATION_READINESS.runtime, providerResolverConfigured: false } })).toBeNull();
    expect(JSON.stringify(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_GENERATION_READINESS)).not.toMatch(/keyId|secret|credential|password|pin|cookie|session/i);
  });
  it("blocks incompatible build preflight, issue, and generation before any grant operation", async () => {
    const grants = { preflight: vi.fn(), issue: vi.fn(), inspectAvailable: vi.fn() };
    const generateFlowBootstrapAdaptation = vi.fn();
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, {
      getFlowBootstrapGenerationRuntimeReadiness: vi.fn().mockReturnValue({ providerResolverConfigured: false, nativeNodeRegistryConfigured: false }),
      generateFlowBootstrapAdaptation
    } as any, undefined, undefined, undefined, grants as any);
    const actor: ProgramApiActor = { sessionId: "session.one", userId: "user.one", roleId: "admin", permissions: ["runtime.control", "flows.write"] };
    const build = { purpose: "build_and_adapt", keyId: "secret:key", projectId: "project.one", flowId: "flow.one" };

    await expect(registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.preflightLlmExecution, scope: {}, actor, payload: build })).resolves.toMatchObject({ ok: false, error: "Flow bootstrap generation runtime is unavailable.", payload: { readiness: { supported: false } } });
    await expect(registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.issueLlmExecutionGrant, scope: {}, actor, payload: { ...build, authSessionId: "session.one", authorizationPassword: "private-password", authorizationPin: "654321" } })).resolves.toMatchObject({ ok: false, error: "Flow bootstrap generation runtime is unavailable.", payload: { readiness: { supported: false } } });
    await expect(registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.generateFlowBootstrapAdaptation, scope: {}, actor, payload: { projectId: "project.one", flowId: "flow.one", authSessionId: "session.one", llmExecutionGrantId: "llm-grant:any" } })).resolves.toMatchObject({ ok: false, error: "Flow bootstrap generation runtime is unavailable.", payload: { readiness: { supported: false } } });
    expect(grants.preflight).not.toHaveBeenCalled();
    expect(grants.issue).not.toHaveBeenCalled();
    expect(grants.inspectAvailable).not.toHaveBeenCalled();
    expect(generateFlowBootstrapAdaptation).not.toHaveBeenCalled();
  });

  it("generates a sanitized Flow Bootstrap proposal through an available build grant", async () => {
    const generated = {
      projectId: "project.one",
      flowId: "flow.blank",
      adaptationId: "adaptation.bootstrap.one",
      status: "proposed",
      riskLevel: "low",
      sourceInstructionIds: ["instruction.one"],
      baseDependencyDigest: "digest.one",
      baseSettingsRevision: 7,
      accounting: {
        requestId: "request.one",
        estimatedInputTokens: 300,
        provider: "deepseek",
        model: "deepseek-chat",
        inputTokens: 250,
        outputTokens: 100,
        totalTokens: 350,
        estimatedCostUsd: 0.001
      },
      prompt: "private prompt",
      response: "private response",
      keyId: "secret:key",
      grantId: "llm-grant:build"
    };
    const generateFlowBootstrapAdaptation = vi.fn().mockResolvedValue(generated);
    const grants = {
      inspectAvailable: vi.fn().mockResolvedValue({
        grantId: "llm-grant:build",
        purpose: "build_and_adapt",
        executionDigest: "digest.one",
        settingsRevision: 7
      })
    };
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, readyLlmApiService({ generateFlowBootstrapAdaptation }) as any, undefined, undefined, undefined, grants as any);
    const actor: ProgramApiActor = { sessionId: "session.one", userId: "user.one", roleId: "admin", permissions: ["flows.write"] };
    const response = await registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.generateFlowBootstrapAdaptation,
      scope: {},
      actor,
      payload: { projectId: "project.one", flowId: "flow.blank", authSessionId: "session.one", llmExecutionGrantId: "llm-grant:build" }
    });

    expect(grants.inspectAvailable).toHaveBeenCalledWith({
      grantId: "llm-grant:build",
      actorUserId: "user.one",
      actorSessionId: "session.one",
      projectId: "project.one",
      flowId: "flow.blank",
      purpose: "build_and_adapt"
    });
    expect(generateFlowBootstrapAdaptation).toHaveBeenCalledWith({
      projectId: "project.one",
      flowId: "flow.blank",
      executionGrant: {
        grantId: "llm-grant:build",
        actorUserId: "user.one",
        actorSessionId: "session.one",
        purpose: "build_and_adapt",
        executionDigest: "digest.one",
        settingsRevision: 7
      }
    });
    expect(response).toEqual({
      ok: true,
      payload: {
        adaptation: {
          projectId: "project.one",
          flowId: "flow.blank",
          adaptationId: "adaptation.bootstrap.one",
          status: "proposed",
          riskLevel: "low",
          sourceInstructionIds: ["instruction.one"],
          baseDependencyDigest: "digest.one",
          baseSettingsRevision: 7,
          accounting: generated.accounting
        }
      }
    });
    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain("private prompt");
    expect(serialized).not.toContain("private response");
    expect(serialized).not.toContain("secret:key");
    expect(serialized).not.toContain("llm-grant:build");
    expect(serialized).not.toContain("session.one");
  });

  it("rejects unsupported Flow Bootstrap request fields before inspecting or consuming a grant", async () => {
    const grants = { inspectAvailable: vi.fn() };
    const generateFlowBootstrapAdaptation = vi.fn();
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, readyLlmApiService({ generateFlowBootstrapAdaptation }) as any, undefined, undefined, undefined, grants as any);
    const actor: ProgramApiActor = { sessionId: "session.one", userId: "user.one", roleId: "admin", permissions: ["flows.write"] };
    for (const extra of [{ runId: "run.one" }, { authorizedExternalSideEffects: true }, { dryRunLlm: true }, { purpose: "diagnosis_only" }]) {
      const response = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.generateFlowBootstrapAdaptation,
        scope: {},
        actor,
        payload: { projectId: "project.one", flowId: "flow.blank", authSessionId: "session.one", llmExecutionGrantId: "llm-grant:build", ...extra }
      });
      expect(response).toEqual({ ok: false, error: "Flow bootstrap generation request contains unsupported fields." });

    }
    expect(grants.inspectAvailable).not.toHaveBeenCalled();
    expect(generateFlowBootstrapAdaptation).not.toHaveBeenCalled();
  });

  it("fails closed for a diagnosis, stale, or consumed grant and for service-level blank-Flow validation", async () => {
    const inspectAvailable = vi.fn();
    const generateFlowBootstrapAdaptation = vi.fn();
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, readyLlmApiService({ generateFlowBootstrapAdaptation }) as any, undefined, undefined, undefined, { inspectAvailable } as any);
    const actor: ProgramApiActor = { sessionId: "session.one", userId: "user.one", roleId: "admin", permissions: ["flows.write"] };
    const call = () => registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.generateFlowBootstrapAdaptation,
      scope: {},
      actor,
      payload: { projectId: "project.one", flowId: "flow.blank", authSessionId: "session.one", llmExecutionGrantId: "llm-grant:any" }
    });

    inspectAvailable.mockRejectedValueOnce(new Error("LLM execution grant scope mismatch."));
    await expect(call()).resolves.toEqual({ ok: false, error: "LLM execution grant scope mismatch." });
    inspectAvailable.mockRejectedValueOnce(new Error("LLM execution grant is no longer valid."));
    await expect(call()).resolves.toEqual({ ok: false, error: "LLM execution grant is no longer valid." });
    inspectAvailable.mockRejectedValueOnce(new Error("LLM execution grant is unavailable."));
    await expect(call()).resolves.toEqual({ ok: false, error: "LLM execution grant is unavailable." });
    expect(generateFlowBootstrapAdaptation).not.toHaveBeenCalled();

    inspectAvailable.mockResolvedValue({ purpose: "build_and_adapt", executionDigest: "digest.one", settingsRevision: 7 });
    generateFlowBootstrapAdaptation.mockRejectedValueOnce(new Error("Flow Bootstrap requires a blank parent Flow."));
    await expect(call()).resolves.toEqual({ ok: false, error: "Flow Bootstrap generation failed (flow_bootstrap.unclassified_failure)." });
    generateFlowBootstrapAdaptation.mockRejectedValueOnce(new Error("Flow Bootstrap requires a valid active instruction set."));
    await expect(call()).resolves.toEqual({ ok: false, error: "Flow Bootstrap generation failed (flow_bootstrap.unclassified_failure)." });
  });

  it("rejects mismatched sessions and unbounded provider accounting for Flow Bootstrap", async () => {
    const inspectAvailable = vi.fn().mockResolvedValue({ purpose: "build_and_adapt", executionDigest: "digest.one", settingsRevision: 7 });
    const generateFlowBootstrapAdaptation = vi.fn().mockResolvedValue({
      projectId: "project.one",
      flowId: "flow.blank",
      adaptationId: "adaptation.one",
      status: "proposed",
      riskLevel: "low",
      sourceInstructionIds: [],
      baseDependencyDigest: "digest.one",
      baseSettingsRevision: 7,
      accounting: { requestId: "request.one", estimatedInputTokens: 50_001 }
    });
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, readyLlmApiService({ generateFlowBootstrapAdaptation }) as any, undefined, undefined, undefined, { inspectAvailable } as any);
    const actor: ProgramApiActor = { sessionId: "session.one", userId: "user.one", roleId: "admin", permissions: ["flows.write"] };
    const mismatch = await registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.generateFlowBootstrapAdaptation,
      scope: {},
      actor,
      payload: { projectId: "project.one", flowId: "flow.blank", authSessionId: "session.other", llmExecutionGrantId: "llm-grant:build" }
    });
    expect(mismatch).toEqual({ ok: false, error: "Authorization session mismatch." });
    expect(inspectAvailable).not.toHaveBeenCalled();

    const unbounded = await registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.generateFlowBootstrapAdaptation,
      scope: {},
      actor,
      payload: { projectId: "project.one", flowId: "flow.blank", authSessionId: "session.one", llmExecutionGrantId: "llm-grant:build" }
    });
    expect(unbounded).toEqual({ ok: false, error: "Flow bootstrap generation estimated input tokens are invalid." });
  });
  it("rejects mismatched auth sessions and incomplete diagnosis intent", async () => {
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, {} as any, undefined, undefined, undefined, { issue: vi.fn(), preflight: vi.fn() } as any);
    const actor: ProgramApiActor = { sessionId: "session.one", userId: "user.one", roleId: "admin", permissions: ["runtime.control"] };
    await expect(registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.issueLlmExecutionGrant, scope: {}, actor, payload: { authSessionId: "session.other" } })).resolves.toMatchObject({ ok: false });
    await expect(registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.runRuntimeSession, scope: {}, actor, payload: { runIntent: "diagnosis_only" } })).resolves.toMatchObject({ ok: false });
  });
  it("returns only allowlisted Flow Bootstrap provider failure diagnostics and accounting across bundle boundaries", async () => {
    const generateFlowBootstrapAdaptation = vi.fn().mockRejectedValue(Object.assign(
      new Error("Flow Bootstrap generation failed (llm.provider_http_error)."),
      {
        name: "AutomationStudioFlowBootstrapGenerationError",
        rawResponse: "sensitive response body",
        diagnostic: {
          code: "llm.provider_http_error",
          stage: "provider_request",
          retryable: false,
          providerInvocation: "attempted",
          providerResponse: "received",
          accounting: {
            requestId: "llm-request:one",
            estimatedInputTokens: 1996,
            provider: "deepseek",
            model: "deepseek-chat",
            providerStatus: 400
          }
        }
      }
    ));
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, readyLlmApiService({ generateFlowBootstrapAdaptation }) as any, undefined, undefined, undefined, {
      inspectAvailable: vi.fn().mockResolvedValue({ purpose: "build_and_adapt", executionDigest: "digest.one", settingsRevision: 7 })
    } as any);
    const actor: ProgramApiActor = { sessionId: "session.one", userId: "user.one", roleId: "admin", permissions: ["flows.write"] };
    const response = await registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.generateFlowBootstrapAdaptation,
      scope: {},
      actor,
      payload: { projectId: "project.one", flowId: "flow.blank", authSessionId: "session.one", llmExecutionGrantId: "llm-grant:build" }
    });

    expect(response).toEqual({
      ok: false,
      error: "Flow Bootstrap generation failed (llm.provider_http_error).",
      payload: { diagnostic: {
        code: "llm.provider_http_error",
        stage: "provider_request",
        retryable: false,
        providerInvocation: "attempted",
        providerResponse: "received",
        accounting: {
          requestId: "llm-request:one",
          estimatedInputTokens: 1996,
          provider: "deepseek",
          model: "deepseek-chat",
          providerStatus: 400
        }
      } }
    });
    expect(JSON.stringify(response)).not.toMatch(/secret|prompt|response body|raw upstream|sensitive|grant:build|session\.one/i);
  });
  it("fails closed without raw text when a structural Flow Bootstrap diagnostic is extra, raw, or malformed", async () => {
    const valid = {
      code: "llm.provider_http_error",
      stage: "provider_request",
      retryable: false,
      providerInvocation: "attempted",
      providerResponse: "received"
    };
    const canonicalMessage = "Flow Bootstrap generation failed (llm.provider_http_error).";
    const invalidErrors = [
      { name: "AutomationStudioFlowBootstrapGenerationError", message: canonicalMessage, diagnostic: { ...valid, extra: "not allowlisted" } },
      { name: "AutomationStudioFlowBootstrapGenerationError", message: canonicalMessage, diagnostic: { ...valid, rawResponse: "sensitive response body" } },
      { name: "AutomationStudioFlowBootstrapGenerationError", message: canonicalMessage, diagnostic: { ...valid, code: "invalid code" } },
      { name: "DifferentError", message: canonicalMessage, diagnostic: valid },
      { message: canonicalMessage, diagnostic: valid },
      { name: "AutomationStudioFlowBootstrapGenerationError", message: "raw upstream failure that must never be returned", diagnostic: valid }
    ];
    for (const error of invalidErrors) {
      const generateFlowBootstrapAdaptation = vi.fn().mockRejectedValue(error);
      const registry = new GlobalProgramApiRegistry();
      registerAutomationStudioApi(registry, readyLlmApiService({ generateFlowBootstrapAdaptation }) as any, undefined, undefined, undefined, {
        inspectAvailable: vi.fn().mockResolvedValue({ purpose: "build_and_adapt", executionDigest: "digest.one", settingsRevision: 7 })
      } as any);
      const response = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.generateFlowBootstrapAdaptation,
        scope: {},
        actor: { sessionId: "session.one", userId: "user.one", roleId: "admin", permissions: ["flows.write"] },
        payload: { projectId: "project.one", flowId: "flow.blank", authSessionId: "session.one", llmExecutionGrantId: "llm-grant:build" }
      });

      expect(response).toEqual({
        ok: false,
        error: "Flow Bootstrap generation failed (flow_bootstrap.unclassified_failure)."
      });
      expect(JSON.stringify(response)).not.toMatch(/raw upstream|sensitive|not allowlisted|invalid code/i);
    }
  });
});

describe("Automation Studio graph patch API", () => {
  it("registers the editor mutation endpoint and persists its bounded graph operations", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    try {
      const project = await service.createProject({ name: "Graph patch API" });
      const flow = await service.createFlow({ projectId: project.id, name: "Patched Flow" });
      const subflow = await service.createFlowSubflow({ projectId: project.id, flowId: flow.flowId, name: "Primary", role: "primary" });
      if (!subflow.graphFlowId) throw new Error("Expected the primary Subflow to own a graph Flow.");
      const graphFlowId = subflow.graphFlowId;
      const registry = new GlobalProgramApiRegistry();
      const authorizeSessionPin = vi.fn().mockResolvedValue({ authorized: true });
      registerAutomationStudioApi(registry, service, { authorizeSessionPin } as any);
      expect(registry.endpoints()).toContainEqual({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.applyGraphPatch,
        permission: "flows.write"
      });
      expect(registry.endpoints()).toContainEqual({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.getGraphViewport,
        permission: "programs.read"
      });

      const response = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.applyGraphPatch,
        scope: {},
        actor: { ...cacheActor("user.graph"), permissions: ["programs.read", "programs.write", "flows.write"] },
        payload: {
          projectId: project.id,
          flowId: graphFlowId,
          authSessionId: "session.user.graph",
          authorizationPin: "123456",
          baseRevision: 1,
          mutationId: "graph-api.initial",
          operations: [
            {
              op: "add_node",
              node: {
                nodeId: "node.start",
                flowId: graphFlowId,
                definitionId: "builtin.control.start",
                definitionVersion: "1.0.0",
                label: "Start",
                description: "",
                x: 0,
                y: 0,
                width: 320,
                height: 180,
                zIndex: 0,
                disabled: false,
                parameterValues: {},
                metadata: {}
              }
            },
            {
              op: "add_node",
              node: {
                nodeId: "node.end",
                flowId: graphFlowId,
                definitionId: "builtin.control.end",
                definitionVersion: "1.0.0",
                label: "End",
                description: "",
                x: 420,
                y: 0,
                width: 320,
                height: 180,
                zIndex: 0,
                disabled: false,
                parameterValues: {},
                metadata: {}
              }
            },
            {
              op: "add_edge",
              edge: {
                edgeId: "edge.start.end",
                flowId: graphFlowId,
                sourceNodeId: "node.start",
                targetNodeId: "node.end",
                sourcePortId: "success",
                targetPortId: "in",
                label: "Next",
                metadata: {}
              }
            }
          ]
        }
      });

      expect(response.ok, response.error).toBe(true);
      expect(response).toMatchObject({
        ok: true,
        payload: {
          result: { status: "applied", baseRevision: 1, revisionNumber: 2 },
          replayed: false,
          flow: { flowId: graphFlowId, graphRevision: 2 }
        }
      });
      expect(authorizeSessionPin).toHaveBeenCalledWith({ sessionId: "session.user.graph", pin: "123456" });
      const saved = await service.getFlow(project.id, graphFlowId);
      expect(saved.nodes.map((node) => node.id).sort()).toEqual(["node.end", "node.start"]);
      expect(saved.edges.map((edge) => edge.id)).toEqual(["edge.start.end"]);
      expect(saved.metadata?.graphRevision).toBe(2);
      const parent = await service.getFlow(project.id, flow.flowId);
      expect(parent.nodes).toEqual([]);
      expect(parent.edges).toEqual([]);
      const viewport = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.getGraphViewport,
        scope: {},
        actor: cacheActor("user.graph"),
        payload: {
          projectId: project.id,
          flowId: graphFlowId,
          bounds: { minX: -100, minY: -100, maxX: 1_000, maxY: 1_000 },
          limit: 500
        }
      });
      expect(viewport).toMatchObject({
        ok: true,
        payload: {
          flow: { flowId: graphFlowId, nodes: [], edges: [], metadata: { graphRevision: 2 } },
          page: { graphRevision: 2, hasMore: false, nodes: [{ nodeId: "node.end" }, { nodeId: "node.start" }], edges: [{ edgeId: "edge.start.end" }] }
        }
      });
    } finally {
      await cleanup();
    }
  });
});

describe("Automation Studio project UI cache API", () => {
  it("persists cache entries by authenticated user and project scope", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    try {
      const project = await service.createProject({ name: "Cache API" });
      const registry = new GlobalProgramApiRegistry();
      registerAutomationStudioApi(registry, service);

      const save = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.saveProjectUiCache,
        scope: {},
        actor: cacheActor("user.one"),
        payload: { projectId: project.id, entries: [{ cacheKey: "workspace:layout", value: { activeViewId: "router" }, contentRevision: 4 }] }
      });
      expect(save.ok).toBe(true);
      expect(save.payload).toMatchObject({ entries: [{ cacheKey: "workspace:layout", contentRevision: 4 }] });

      const isolated = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.getProjectUiCache,
        scope: {},
        actor: cacheActor("user.two"),
        payload: { projectId: project.id, cacheKeys: ["workspace:layout"] }
      });
      expect(isolated.payload).toEqual({ entries: [], missingKeys: ["workspace:layout"] });

      const loaded = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.getProjectUiCache,
        scope: {},
        actor: cacheActor("user.one"),
        payload: { projectId: project.id, cacheKeys: ["workspace:layout", "sidebar:tree"] }
      });
      expect(loaded.payload).toMatchObject({
        entries: [{ cacheKey: "workspace:layout", value: { activeViewId: "router" } }],
        missingKeys: ["sidebar:tree"]
      });

      const stats = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.listProjectUiCacheStats,
        scope: {},
        actor: cacheActor("user.one"),
        payload: { projectId: project.id }
      });
      expect(stats.ok).toBe(true);
      const statsPayload = stats.payload as { stats: Array<{ projectId: string; entries: number }> };
      expect(statsPayload.stats).toHaveLength(1);
      expect(statsPayload.stats[0]).toBeDefined();
      expect(statsPayload.stats[0]!.projectId).toBe(project.id);
      expect(statsPayload.stats[0]!.entries).toBe(1);

      const deleted = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteProjectUiCache,
        scope: {},
        actor: cacheActor("user.one"),
        payload: { projectId: project.id, cacheKeys: ["workspace:layout"] }
      });
      expect(deleted.payload).toEqual({ deleted: 1 });
    } finally {
      await cleanup();
    }
  });


  it("clears rebuildable cache when a project is deleted", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    try {
      const project = await service.createProject({ name: "Cache Delete" });
      await service.saveProjectUiCache({ projectId: project.id, userId: "user.one", entries: [{ cacheKey: "workspace:layout", value: { activeViewId: "router" } }] });
      await expect(service.listProjectUiCacheStats({ userId: "user.one" })).resolves.toMatchObject({ stats: [{ projectId: project.id, entryCount: 1 }] });
      await service.deleteProject(project.id);
      await expect(service.listProjectUiCacheStats({ userId: "user.one" })).resolves.toEqual({ stats: [] });
    } finally {
      await cleanup();
    }
  });
  it("rejects cache batches above the server limit", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    try {
      const project = await service.createProject({ name: "Cache Limits" });
      const registry = new GlobalProgramApiRegistry();
      registerAutomationStudioApi(registry, service);

      const response = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.saveProjectUiCache,
        scope: {},
        actor: cacheActor("user.one"),
        payload: {
          projectId: project.id,
          entries: Array.from({ length: 101 }, (_, index) => ({ cacheKey: `key:${index}`, value: index }))
        }
      });

      expect(response.ok).toBe(false);
      expect(response.error).toContain("at most 100 entries");
    } finally {
      await cleanup();
    }
  });
});

describe("Automation Studio hierarchy page API", () => {
  it("registers bounded hierarchy mutations and preserves unrelated hierarchy state", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    try {
      const project = await service.createProject({ name: "Bounded hierarchy mutations" });
      await service.saveProjectHierarchy(project.id, {
        customHierarchyNodes: [
          { id: "folder.root", label: "Root", kind: "folder", category: "flow", parentId: null },
          { id: "folder.child", label: "Child", kind: "folder", category: "flow", parentId: "folder.root" },
          { id: "folder.sibling", label: "Sibling", kind: "folder", category: "flow", parentId: null }
        ],
        deletedHierarchyIds: ["folder.previously-deleted"],
        workspacePrefs: { mainLayoutPreset: "single" }
      });
      const registry = new GlobalProgramApiRegistry();
      registerAutomationStudioApi(registry, service);

      expect(AUTOMATION_STUDIO_ENDPOINTS.putProjectHierarchyNode).toBe("put-project-hierarchy-node");
      expect(AUTOMATION_STUDIO_ENDPOINTS.deleteProjectHierarchyNode).toBe("delete-project-hierarchy-node");
      expect(registry.endpoints()).toEqual(expect.arrayContaining([
        { programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.putProjectHierarchyNode, permission: "programs.write" },
        { programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteProjectHierarchyNode, permission: "programs.write" }
      ]));

      const put = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.putProjectHierarchyNode,
        scope: {},
        actor: cacheActor("user.hierarchy"),
        payload: {
          projectId: project.id,
          mutationId: "hierarchy.put.root",
          node: { id: "folder.root", label: "Root renamed", kind: "folder", category: "flow", parentId: null }
        }
      });
      expect(put).toMatchObject({ ok: true, payload: { nodeId: "folder.root" } });
      expect(await service.getProjectHierarchy(project.id)).toEqual({
        customHierarchyNodes: [
          { id: "folder.root", label: "Root renamed", kind: "folder", category: "flow", parentId: null },
          { id: "folder.child", label: "Child", kind: "folder", category: "flow", parentId: "folder.root" },
          { id: "folder.sibling", label: "Sibling", kind: "folder", category: "flow", parentId: null }
        ],
        deletedHierarchyIds: ["folder.previously-deleted"],
        workspacePrefs: { mainLayoutPreset: "single" }
      });

      const deleted = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteProjectHierarchyNode,
        scope: {},
        actor: cacheActor("user.hierarchy"),
        payload: { projectId: project.id, nodeId: "folder.root", mutationId: "hierarchy.delete.root" }
      });
      expect(deleted).toMatchObject({ ok: true, payload: { nodeId: "folder.root", deletedCount: 2 } });
      expect(await service.getProjectHierarchy(project.id)).toEqual({
        customHierarchyNodes: [
          { id: "folder.sibling", label: "Sibling", kind: "folder", category: "flow", parentId: null }
        ],
        deletedHierarchyIds: ["folder.previously-deleted", "folder.root", "folder.child"],
        workspacePrefs: { mainLayoutPreset: "single" }
      });

      const malformed = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.putProjectHierarchyNode,
        scope: {},
        actor: cacheActor("user.hierarchy"),
        payload: { projectId: project.id, node: { id: "", label: "Broken", kind: "folder", category: "flow", parentId: null } }
      });
      expect(malformed.ok).toBe(false);
      expect(malformed.error).toContain("node.id is required");
    } finally {
      await cleanup();
    }
  });

  it("imports legacy hierarchy once and returns stable SQL sibling pages", async () => {
    const { service, dataDir, cleanup } = await createCacheApiTestService();
    try {
      const project = await service.createProject({ name: "Hierarchy pages" });
      await service.saveProjectHierarchy(project.id, {
        customHierarchyNodes: [
          { id: "folder.a", label: "Alpha", kind: "folder", category: "flow", parentId: null },
          { id: "folder.b", label: "Beta", kind: "folder", category: "flow", parentId: null },
          { id: "folder.c", label: "Charlie", kind: "folder", category: "flow", parentId: null }
        ],
        deletedHierarchyIds: [],
        workspacePrefs: {}
      });
      const registry = new GlobalProgramApiRegistry();
      registerAutomationStudioApi(registry, service);

      const first = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.listProjectHierarchyChildren,
        scope: {},
        actor: cacheActor("user.one"),
        payload: { projectId: project.id, parentId: null, limit: 2 }
      });
      expect(first.ok).toBe(true);
      const firstPage = (first.payload as { page: { items: Array<{ entryId: string }>; nextCursor: string | null; hasMore: boolean } }).page;
      expect(firstPage.items.map((item) => item.entryId)).toEqual(["folder.a", "folder.b"]);
      expect(firstPage.hasMore).toBe(true);
      expect(firstPage.nextCursor).toBeTypeOf("string");

      await writeFile(
        path.join(dataDir, "programs", "automation-studio", "projects", project.id, "hierarchy", "nodes.json"),
        "legacy hierarchy must not be parsed after SQL cutover",
        "utf8"
      );

      const second = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.listProjectHierarchyChildren,
        scope: {},
        actor: cacheActor("user.one"),
        payload: { projectId: project.id, parentId: null, cursor: firstPage.nextCursor, limit: 2 }
      });
      expect((second.payload as { page: { items: Array<{ entryId: string }>; hasMore: boolean } }).page).toMatchObject({
        items: [{ entryId: "folder.c" }],
        hasMore: false
      });

      const emptyFolder = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.listProjectHierarchyChildren,
        scope: {},
        actor: cacheActor("user.one"),
        payload: { projectId: project.id, parentId: "folder.a", limit: 2 }
      });
      expect(emptyFolder).toMatchObject({
        ok: true,
        payload: { page: { items: [], nextCursor: null, hasMore: false } }
      });
    } finally {
      await cleanup();
    }
  });
});

describe("Automation Studio Client Gateway paging API", () => {
  it("returns summary counts and opaque stable pages capped by the handler", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    const gateway = new ClientGatewayService();
    try {
      for (let index = 0; index < 125; index += 1) {
        const session = gateway.connect();
        await gateway.receive(session.sessionId, {
          protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION,
          id: `message.${index}`,
          type: "client.hello",
          timestamp: index + 1,
          payload: { clientId: `client-${String(index).padStart(4, "0")}`, clientType: "extension", name: `Client ${String(index).padStart(4, "0")}` }
        });
      }
      const registry = new GlobalProgramApiRegistry();
      registerAutomationStudioApi(registry, service, undefined, undefined, gateway);
      const snapshot = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.clientGatewaySnapshot, scope: {}, actor: cacheActor("user.gateway"), payload: {} });
      expect(snapshot.payload).toMatchObject({ counts: { sessions: 125, pairings: 125, trustedClients: 0 }, sessions: [], pairings: [], trustedClients: [] });

      const first = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.listClientGatewayItems, scope: {}, actor: cacheActor("user.gateway"), payload: { kind: "sessions", limit: 500 } });
      const firstPayload = first.payload as { items: Array<{ sessionId: string }>; page: { total: number; limit: number; nextCursor: string | null; hasMore: boolean } };
      expect(firstPayload.page).toMatchObject({ total: 125, limit: 200, hasMore: false });
      expect(firstPayload.items).toHaveLength(125);

      const pageOne = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.listClientGatewayItems, scope: {}, actor: cacheActor("user.gateway"), payload: { kind: "sessions", limit: 50 } });
      const one = pageOne.payload as typeof firstPayload;
      expect(one).toMatchObject({ page: { total: 125, limit: 50, hasMore: true } });
      expect(one.items).toHaveLength(50);
      const pageTwo = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.listClientGatewayItems, scope: {}, actor: cacheActor("user.gateway"), payload: { kind: "sessions", limit: 50, cursor: one.page.nextCursor } });
      const two = pageTwo.payload as typeof firstPayload;
      expect(two.items).toHaveLength(50);
      expect(new Set([...one.items, ...two.items].map((item) => item.sessionId)).size).toBe(100);

      const mismatched = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.listClientGatewayItems, scope: {}, actor: cacheActor("user.gateway"), payload: { kind: "sessions", limit: 50, search: "changed", cursor: one.page.nextCursor } });
      expect(mismatched).toMatchObject({ ok: false, error: expect.stringMatching(/does not match/) });
    } finally {
      await cleanup();
    }
  });
});

describe("Automation Studio Problems paging API", () => {
  it("pages through the dedicated service contract without hydrating the broad snapshot", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    try {
      const project = await service.createProject({ name: "Problem pages" });
      const snapshot = vi.spyOn(service, "snapshot").mockRejectedValue(new Error("broad snapshot must not be used"));
      const registry = new GlobalProgramApiRegistry();
      registerAutomationStudioApi(registry, service);

      const response = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.listProjectProblems,
        scope: {},
        actor: cacheActor("user.problems"),
        payload: { projectId: project.id, status: "all", limit: 25 }
      });
      expect(response).toMatchObject({
        ok: true,
        payload: {
          problems: [{ id: "automation-studio.host-artifacts" }],
          page: { total: 1, limit: 25, hasMore: false, nextCursor: null }
        }
      });
      expect(snapshot).not.toHaveBeenCalled();

      const invalid = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.listProjectProblems,
        scope: {},
        actor: cacheActor("user.problems"),
        payload: { projectId: project.id, severity: "critical" }
      });
      expect(invalid).toMatchObject({ ok: false, error: expect.stringMatching(/severity filter/) });
    } finally {
      await cleanup();
    }
  });
});

describe("Automation Studio Router target-reference API", () => {
  it("forwards a bounded Subflow batch and returns compact references", async () => {
    const { service, cleanup } = await createCacheApiTestService();
    try {
      const listReferences = vi.spyOn(service, "listFlowRouterTargetReferences").mockResolvedValue({
        perTargetLimit: 20,
        targets: [{ subflowId: "subflow.one", total: 1, hasMore: false, references: [{ id: "route.one", kind: "route", name: "One", status: "active", order: 1, conditionLabel: "Always" }] }]
      });
      const registry = new GlobalProgramApiRegistry();
      registerAutomationStudioApi(registry, service);
      const response = await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.listFlowRouterTargetReferences,
        scope: {},
        actor: cacheActor("user.router-references"),
        payload: { projectId: "project.one", flowId: "flow.one", subflowIds: ["subflow.one"], perTargetLimit: 20 }
      });
      expect(listReferences).toHaveBeenCalledWith({ projectId: "project.one", flowId: "flow.one", subflowIds: ["subflow.one"], perTargetLimit: 20 });
      expect(response).toMatchObject({ ok: true, payload: { targets: [{ subflowId: "subflow.one", total: 1 }], batch: { perTargetLimit: 20 } } });
    } finally {
      await cleanup();
    }
  });
});
describe("Automation Studio explicit legacy representation migration API", () => {
  it("requires flows.write and PIN authorization before forwarding the exact target", async () => {
    const migrateLegacyFlowRepresentation = vi.fn().mockResolvedValue({
      parentFlow: { flowId: "flow.parent" },
      subflow: { subflowId: "subflow.primary" },
      graphFlow: { flowId: "flow.graph" }
    });
    const authorizeSessionPin = vi.fn().mockResolvedValue({ authorized: true });
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, { migrateLegacyFlowRepresentation } as any, { authorizeSessionPin } as any);

    expect(registry.endpoints()).toContainEqual({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.migrateLegacyFlowRepresentation,
      permission: "flows.write"
    });
    const response = await registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.migrateLegacyFlowRepresentation,
      scope: {},
      actor: { ...cacheActor("user.migration"), permissions: ["programs.read", "programs.write", "flows.write"] },
      payload: {
        projectId: "project.one",
        flowId: "flow.parent",
        subflowId: "subflow.primary",
        authSessionId: "session.user.migration",
        authorizationPin: "123456"
      }
    });

    expect(authorizeSessionPin).toHaveBeenCalledWith({ sessionId: "session.user.migration", pin: "123456" });
    expect(migrateLegacyFlowRepresentation).toHaveBeenCalledWith({ projectId: "project.one", flowId: "flow.parent", subflowId: "subflow.primary" });
    expect(response).toMatchObject({ ok: true, payload: { parentFlow: { flowId: "flow.parent" }, subflow: { subflowId: "subflow.primary" }, graphFlow: { flowId: "flow.graph" } } });
  });
});
