// Covers handlers/llm-generation.ts and the runtime-execution endpoints the
// same grants gate.

import { describe, expect, it, vi } from "vitest";

import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../../_shared/api.ts";

import { AUTOMATION_STUDIO_ENDPOINTS, AUTOMATION_STUDIO_FLOW_BOOTSTRAP_GENERATION_READINESS, parseAutomationStudioFlowBootstrapGenerationReadiness } from "../../contracts.ts";
import { registerAutomationStudioApi } from "../index.ts";

function readyLlmApiService<T extends object>(service: T): T & { getFlowBootstrapGenerationRuntimeReadiness(): { providerResolverConfigured: true; nativeNodeRegistryConfigured: true } } {
  return Object.assign({
    getFlowBootstrapGenerationRuntimeReadiness: () => ({ providerResolverConfigured: true as const, nativeNodeRegistryConfigured: true as const })
  }, service);
}

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
    const issued = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.issueLlmExecutionGrant, scope: {}, actor, payload: { authSessionId: "session.one", keyId: "secret:key", projectId: "project.one", flowId: "flow.one", tokenLimits: { maxInputTokens: 4000, maxOutputTokens: 1000, maxTotalTokens: 5000 }, maxCalls: 1, maxEstimatedCostUsd: 0.1, timeoutMs: 10000 } });
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

  it("forwards diagnose_and_adapt as a fresh exact-purpose runtime execution", async () => {
    const runRuntimeSession = vi.fn().mockResolvedValue({ runId: "run.adapt", status: "failed" });
    const getFlowRunDetail = vi.fn().mockResolvedValue({
      adaptationIds: ["adaptation.manual"],
      summary: { interventionCount: 1 },
      metadata: { runtimePatchAttempts: [{ adaptationId: "adaptation.manual", approvalDecision: { autoApply: false } }] }
    });
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, { runRuntimeSession, getFlowRunDetail } as any, undefined, undefined, undefined, { revoke: vi.fn() } as any);
    const actor: ProgramApiActor = { sessionId: "session.one", userId: "user.one", roleId: "admin", permissions: ["runtime.control"] };

    const response = await registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.runRuntimeSession,
      scope: {},
      actor,
      payload: {
        projectId: "project.one",
        flowId: "flow.one",
        runIntent: "diagnose_and_adapt",
        llmExecutionGrantId: "llm-grant:adapt"
      }
    });

    expect(response).toMatchObject({
      ok: true,
      payload: {
        createdAdaptationIds: ["adaptation.manual"],
        interventionCount: 1,
        durableBehaviorChanged: false
      }
    });
    expect(runRuntimeSession).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project.one",
      flowId: "flow.one",
      llmExecution: {
        grantId: "llm-grant:adapt",
        actorUserId: "user.one",
        actorSessionId: "session.one",
        purpose: "diagnose_and_adapt"
      }
    }));
  });

  it("threads the explicit bounded four-call exploration profile without credential fields", async () => {
    const grants = {
      preflight: vi.fn().mockResolvedValue({ purpose: "build_and_adapt", executionDigest: "digest.one", settingsRevision: 3, keyUpdatedAtMs: 4, maxCalls: 4, maxTotalEstimatedCostUsd: 1 }),
      issue: vi.fn().mockResolvedValue({ grantId: "llm-grant:build", purpose: "build_and_adapt", executionDigest: "digest.one", settingsRevision: 3, keyUpdatedAtMs: 4, remainingUses: 8 }),
      revoke: vi.fn()
    };
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, readyLlmApiService({}) as any, undefined, undefined, undefined, grants as any);
    const actor: ProgramApiActor = { sessionId: "session.one", userId: "user.one", roleId: "admin", permissions: ["runtime.control"] };
    const limits = { purpose: "build_and_adapt", keyId: "secret:key", projectId: "project.one", flowId: "flow.one", tokenLimits: { maxInputTokens: 8_000, maxOutputTokens: 4_000, maxTotalTokens: 12_000 }, maxCalls: 4, timeoutMs: 45_000, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 1, providerRetryCount: 0 };
    const preflight = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.preflightLlmExecution, scope: {}, actor, payload: limits });
    expect(preflight).toMatchObject({ ok: true, payload: { preflight: { purpose: "build_and_adapt", settingsRevision: 3, maxCalls: 4, maxTotalEstimatedCostUsd: 1 } } });
    expect(grants.preflight).toHaveBeenCalledWith(expect.objectContaining(limits));
    const issued = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.issueLlmExecutionGrant, scope: {}, actor, payload: { ...limits, authSessionId: "session.one", maxUses: 4 } });
    expect(issued).toMatchObject({ ok: true, payload: { grant: { grantId: "llm-grant:build", purpose: "build_and_adapt", settingsRevision: 3 } } });
    expect(grants.issue).toHaveBeenCalledWith(expect.objectContaining({ purpose: "build_and_adapt", actorUserId: "user.one", actorSessionId: "session.one", tokenLimits: limits.tokenLimits, maxCalls: 4, timeoutMs: 45_000, maxTotalEstimatedCostUsd: 1, providerRetryCount: 0, maxUses: 4 }));
    expect(grants.issue.mock.calls[0]?.[0]).not.toHaveProperty("authorizationPassword");
    expect(grants.issue.mock.calls[0]?.[0]).not.toHaveProperty("authorizationPin");
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
      payload: { projectId: "project.one", flowId: "flow.blank", authSessionId: "session.one", llmExecutionGrantId: "llm-grant:build", evidenceGuided: true, useReusableContext: true }
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
      evidenceGuided: true,
      useReusableContext: true,
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

  it("saves a bounded generation instruction with the authenticated session before grant issue", async () => {
    const saveFlowGenerationInstruction = vi.fn().mockResolvedValue({ instructionId: "instruction.exploration.one", status: "active", updatedAt: 7 });
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, readyLlmApiService({ saveFlowGenerationInstruction }) as any);
    const actor: ProgramApiActor = { sessionId: "session.one", userId: "user.one", roleId: "admin", permissions: ["flows.write"] };
    const response = await registry.call({
      programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.saveFlowGenerationInstruction, scope: {}, actor,
      payload: { projectId: "project.one", flowId: "flow.blank", authSessionId: "session.one", instruction: "Inspect evidence and build the Flow." }
    });
    expect(saveFlowGenerationInstruction).toHaveBeenCalledWith({ projectId: "project.one", flowId: "flow.blank", instruction: "Inspect evidence and build the Flow." });
    expect(response).toEqual({ ok: true, payload: { instruction: { instructionId: "instruction.exploration.one", status: "active", updatedAt: 7 } } });
    await expect(registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.saveFlowGenerationInstruction, scope: {}, actor, payload: { projectId: "project.one", flowId: "flow.blank", authSessionId: "session.other", instruction: "x" } })).resolves.toMatchObject({ ok: false, error: "Authorization session mismatch." });
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
      new Error("Flow Bootstrap generation failed (flow_bootstrap.provider_output_padding_truncated)."),
      {
        name: "AutomationStudioFlowBootstrapGenerationError",
        rawResponse: "sensitive provider padding",
        diagnostic: {
          code: "flow_bootstrap.provider_output_padding_truncated",
          stage: "provider_output_validation",
          retryable: false,
          providerInvocation: "attempted",
          providerResponse: "received",
          accounting: {
            requestId: "llm-request:one",
            estimatedInputTokens: 1996,
            provider: "deepseek",
            model: "deepseek-chat",
            inputTokens: 1996,
            outputTokens: 512,
            totalTokens: 2508
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
      error: "Flow Bootstrap generation failed (flow_bootstrap.provider_output_padding_truncated).",
      payload: { diagnostic: {
        code: "flow_bootstrap.provider_output_padding_truncated",
        stage: "provider_output_validation",
        retryable: false,
        providerInvocation: "attempted",
        providerResponse: "received",
        accounting: {
          requestId: "llm-request:one",
          estimatedInputTokens: 1996,
          provider: "deepseek",
          model: "deepseek-chat",
          inputTokens: 1996,
          outputTokens: 512,
          totalTokens: 2508
        }
      } }
    });
    expect(JSON.stringify(response)).not.toMatch(/secret|prompt|provider padding|raw upstream|sensitive|grant:build|session\.one/i);
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
