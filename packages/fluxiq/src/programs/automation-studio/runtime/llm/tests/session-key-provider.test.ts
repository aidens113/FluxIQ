import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioLlmTaskRequest } from "../harness.ts";
import type { AutomationStudioSessionKeyPorts } from "../deepseek/index.ts";
import { AUTOMATION_STUDIO_DEEPSEEK_MODEL_LIMITS, AUTOMATION_STUDIO_DEEPSEEK_MODELS } from "../deepseek/index.ts";
import { AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD, automationStudioLlmResolutionWithinFlowSettings } from "../flow-execution-limits/index.ts";
import { AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS, createAutomationStudioSessionKeyProviderResolver } from "../session-key-provider.ts";
import { AutomationStudioSecretsLockedError } from "../deepseek/index.ts";
import { IdentityAccessService } from "../../../../identity-access/index.ts";
import { SecretKeysService } from "../../../../secret-keys/index.ts";

const WEAK_KDF = { testOnlyWeakParameters: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } as const };
const PASSWORD_A = "dummy-password-a";

// A model call made for a person needs no grant: nothing is issued, held or
// checked first. The call runs on the person's own key, released per call to
// their unlocked session, and fails only when that key cannot be released.

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("session-key provider resolver", () => {
  it("makes a model call with no grant, on the caller's own key, released to their session", async () => {
    const reveals: Array<{ sessionId: string; userId: string }> = [];
    let authorization = "";
    const resolve = createAutomationStudioSessionKeyProviderResolver({
      ports: ports({ onReveal: (input) => reveals.push(input) }),
      fetchImpl: (async (_url: unknown, init?: RequestInit) => {
        authorization = new Headers(init?.headers).get("authorization") ?? "";
        return responseEnvelope({ kind: "diagnosis", summary: "Fine." });
      }) as typeof fetch
    });
    const resolution = resolve({ projectId: "project.one", flowId: "flow.one", caller: { actorUserId: "user.one", actorSessionId: "session.one" } });
    expect(resolution).toBeDefined();
    expect(resolution).toMatchObject({ timeoutMs: AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS.timeoutMs, maxEstimatedCostUsd: AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD, maxTotalEstimatedCostUsd: AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD });
    const first = await resolution!.provider.runTask(request()) as { response: unknown };
    await resolution!.provider.runTask(request({ requestId: "request.two", idempotencyKey: "idempotency.two" }));
    expect(first.response).toMatchObject({ kind: "diagnosis" });
    expect(authorization).toBe("Bearer key-value");
    // One release per call, each to the caller's own session; nothing held between.
    expect(reveals).toEqual([{ sessionId: "session.one", userId: "user.one" }, { sessionId: "session.one", userId: "user.one" }]);
  });

  // The one per-request limit is the model's context window (2026-09-30): the
  // profile is the whole window, the reply reserved out of it.
  it("clamps a session-backed Flow to the isolated test budget while leaving settings untouched", async () => {
    vi.stubEnv("FLUXIQ_LLM_RUN_COST_CEILING_SCOPE", "test");
    vi.stubEnv("FLUXIQ_LLM_RUN_COST_CEILING_USD", "0.1");
    vi.resetModules();
    const scoped = await import("../session-key-provider.ts");
    const resolve = scoped.createAutomationStudioSessionKeyProviderResolver({ ports: ports() });
    const metadata = { adaptationPolicySettings: { maxEstimatedCostUsdPerRun: 1 } };
    const resolution = resolve({ projectId: "p", flowId: "f", caller: { actorUserId: "u", actorSessionId: "s" }, metadata });
    expect(resolution).toMatchObject({ maxEstimatedCostUsd: 0.1, maxTotalEstimatedCostUsd: 0.1 });
    expect(metadata.adaptationPolicySettings.maxEstimatedCostUsdPerRun).toBe(1);
  });

  it("honors a normal user's explicit Flow budget rather than lowering it to the default", () => {
    const resolve = createAutomationStudioSessionKeyProviderResolver({ ports: ports() });
    const resolution = resolve({ projectId: "p", flowId: "f", caller: { actorUserId: "u", actorSessionId: "s" }, metadata: { adaptationPolicySettings: { maxEstimatedCostUsdPerRun: 1 } } });
    expect(resolution).toMatchObject({ maxEstimatedCostUsd: 1, maxTotalEstimatedCostUsd: 1 });
    const narrowed = automationStudioLlmResolutionWithinFlowSettings(resolution, { llmExecutionSettings: { maxEstimatedCostUsd: 0.05 } });
    expect(narrowed).toMatchObject({ maxEstimatedCostUsd: 0.05, maxTotalEstimatedCostUsd: 1 });
  });

  it("sizes one call to the model's whole context window", () => {
    const resolve = createAutomationStudioSessionKeyProviderResolver({ ports: ports() });
    const caller = { actorUserId: "user.one", actorSessionId: "session.one" };
    for (const model of AUTOMATION_STUDIO_DEEPSEEK_MODELS) {
      const window = AUTOMATION_STUDIO_DEEPSEEK_MODEL_LIMITS[model].contextTokens;
      const { tokenLimits } = resolve({ projectId: "p", flowId: "f", caller, modelId: model })!;
      expect(tokenLimits).toEqual({ maxInputTokens: window - 8_000, maxOutputTokens: 8_000, maxTotalTokens: window });
    }
    expect(AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS.tokenLimits).toEqual({ maxInputTokens: 992_000, maxOutputTokens: 8_000, maxTotalTokens: 1_000_000 });
  });

  it("resolves no provider for a call made for nobody", () => {
    const resolve = createAutomationStudioSessionKeyProviderResolver({ ports: ports() });
    expect(resolve({ projectId: "project.one", flowId: "flow.one" })).toBeUndefined();
  });

  it("uses the Flow's configured model and falls back to Core's default for an unknown one", () => {
    const resolve = createAutomationStudioSessionKeyProviderResolver({ ports: ports() });
    const caller = { actorUserId: "user.one", actorSessionId: "session.one" };
    expect(resolve({ projectId: "p", flowId: "f", caller, modelId: "deepseek-flash" })!.provider.metadata).toMatchObject({ provider: "deepseek", model: "deepseek-flash" });
    expect(resolve({ projectId: "p", flowId: "f", caller, modelId: "not-a-model" })!.provider.metadata).toMatchObject({ provider: "deepseek" });
  });

  it("fails the call, in words a person can act on, when the session has not unlocked the key", async () => {
    const resolve = createAutomationStudioSessionKeyProviderResolver({
      ports: ports({ locked: true }),
      fetchImpl: (async () => responseEnvelope({ kind: "diagnosis", summary: "Fine." })) as typeof fetch
    });
    const resolution = resolve({ projectId: "project.one", flowId: "flow.one", caller: { actorUserId: "user.one", actorSessionId: "session.one" } });
    await expect(resolution!.provider.runTask(request())).rejects.toThrow();
  });
});

// Each call resolves the person's live unlock again (H0-S5), against the real
// Secret Keys and Identity Access services: weak scrypt, fake keys, a fetch
// stub, no network.
describe("session-key provider resolver, unlock resolved per call", () => {
  const services: SecretKeysService[] = [];
  afterEach(() => {
    for (const service of services.splice(0)) service.close();
  });
  function secretKeys(): SecretKeysService {
    const service = new SecretKeysService({ passwordKdf: WEAK_KDF });
    services.push(service);
    return service;
  }
  function stubbedFetch(): { fetchImpl: typeof fetch; bearers: string[] } {
    const bearers: string[] = [];
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      bearers.push(new Headers(init?.headers).get("authorization") ?? "");
      return responseEnvelope({ kind: "diagnosis", summary: "Fine." });
    }) as typeof fetch;
    return { fetchImpl, bearers };
  }
  const later = () => Date.now() + 60_000;

  it("keeps a build going after its started-from session logs out while another unlock lives, then fails with secrets.locked", async () => {
    const keys = secretKeys();
    await keys.createKey({ name: "DeepSeek", kind: "llm", provider: "deepseek", value: "fake-key-A", authorizationPassword: PASSWORD_A, createdBy: "user.A" });
    await keys.unlockSession({ sessionId: "sess.A-started", userId: "user.A", authorizationPassword: PASSWORD_A, expiresAtMs: later() });
    await keys.unlockSession({ sessionId: "sess.A-other", userId: "user.A", authorizationPassword: PASSWORD_A, expiresAtMs: later() });
    const { fetchImpl, bearers } = stubbedFetch();
    const resolve = createAutomationStudioSessionKeyProviderResolver({ ports: keys, fetchImpl, instanceHost: "app.example.test" });
    const { provider } = resolve({ projectId: "project.one", flowId: "flow.one", caller: { actorUserId: "user.A", actorSessionId: "sess.A-started" } })!;
    await provider.runTask(request());
    keys.revokeSessionUnlock("sess.A-started", { userId: "user.A", administrator: false });
    await provider.runTask(request({ requestId: "request.two", idempotencyKey: "idempotency.two" }));
    keys.revokeSessionUnlock("sess.A-other", { userId: "user.A", administrator: false });
    const failure = await provider.runTask(request({ requestId: "request.three", idempotencyKey: "idempotency.three" })).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AutomationStudioSecretsLockedError);
    expect(failure).toMatchObject({ code: "secrets.locked", message: "Sign in at app.example.test to unlock your model key" });
    expect(bearers).toEqual(["Bearer fake-key-A", "Bearer fake-key-A"]);
  });

  it("drops the unlock on an administrator's session revoke, so the next call is secrets.locked", async () => {
    const keys = secretKeys();
    const identity = new IdentityAccessService({ passwordKdf: WEAK_KDF, sessionRevocationSubscribers: [(sessionId, revoker) => { keys.revokeSessionUnlock(sessionId, revoker); }] });
    await identity.upsertUser({ id: "user.A", username: "user-a", displayName: "User A", roleId: "viewer", password: PASSWORD_A });
    const login = await identity.authenticate({ username: "user-a", password: PASSWORD_A });
    await keys.createKey({ name: "DeepSeek", kind: "llm", provider: "deepseek", value: "fake-key-A", authorizationPassword: PASSWORD_A, createdBy: "user.A" });
    await keys.unlockSession({ sessionId: login.session.id, userId: "user.A", authorizationPassword: PASSWORD_A, expiresAtMs: login.session.expiresAtMs });
    const { fetchImpl, bearers } = stubbedFetch();
    const { provider } = createAutomationStudioSessionKeyProviderResolver({ ports: keys, fetchImpl })({ projectId: "project.one", flowId: "flow.one", caller: { actorUserId: "user.A", actorSessionId: login.session.id } })!;
    await provider.runTask(request());
    expect(await identity.revokeSession(login.session.id)).toBe(true);
    expect(keys.unlockedSessionFor("user.A")).toBeNull();
    await expect(provider.runTask(request({ requestId: "request.two", idempotencyKey: "idempotency.two" }))).rejects.toMatchObject({ code: "secrets.locked" });
    expect(bearers).toEqual(["Bearer fake-key-A"]);
  });

  it("leaves single-user local unchanged: one admin, one key, the sign-in unlock pays for the build", async () => {
    const keys = secretKeys();
    const identity = new IdentityAccessService({ passwordKdf: WEAK_KDF });
    const login = await identity.authenticate({ username: "admin", password: "admin" });
    await keys.createKey({ name: "DeepSeek", kind: "llm", provider: "deepseek", value: "fake-key-admin", authorizationPassword: "admin", createdBy: login.user.id });
    await keys.unlockSession({ sessionId: login.session.id, userId: login.user.id, authorizationPassword: "admin", expiresAtMs: login.session.expiresAtMs });
    const { fetchImpl, bearers } = stubbedFetch();
    const { provider } = createAutomationStudioSessionKeyProviderResolver({ ports: keys, fetchImpl })({ projectId: "project.one", flowId: "flow.one", caller: { actorUserId: login.user.id, actorSessionId: login.session.id } })!;
    await provider.runTask(request());
    expect(bearers).toEqual(["Bearer fake-key-admin"]);
  });

  it("uses the Flow's own key, from the host's lookup or the call's metadata", async () => {
    const keys = secretKeys();
    const flowKey = await keys.createKey({ name: "Flow key", kind: "llm", provider: "deepseek", value: "fake-key-flow", authorizationPassword: PASSWORD_A, createdBy: "user.A", nowMs: 100 });
    await keys.createKey({ name: "Newest", kind: "llm", provider: "deepseek", value: "fake-key-newest", authorizationPassword: PASSWORD_A, createdBy: "user.A", nowMs: 200 });
    await keys.unlockSession({ sessionId: "sess.A", userId: "user.A", authorizationPassword: PASSWORD_A, expiresAtMs: later() });
    const { fetchImpl, bearers } = stubbedFetch();
    const caller = { actorUserId: "user.A", actorSessionId: "sess.A" };
    const lookup = vi.fn(async () => flowKey.id);
    await createAutomationStudioSessionKeyProviderResolver({ ports: keys, fetchImpl, flowSecretKeyId: lookup })({ projectId: "project.one", flowId: "flow.one", caller })!.provider.runTask(request());
    expect(lookup).toHaveBeenCalledWith({ projectId: "project.one", flowId: "flow.one" });
    await createAutomationStudioSessionKeyProviderResolver({ ports: keys, fetchImpl })({ projectId: "project.one", flowId: "flow.one", caller, metadata: { llmSecretKeyId: flowKey.id } })!.provider.runTask(request());
    await createAutomationStudioSessionKeyProviderResolver({ ports: keys, fetchImpl })({ projectId: "project.one", flowId: "flow.one", caller })!.provider.runTask(request());
    expect(bearers).toEqual(["Bearer fake-key-flow", "Bearer fake-key-flow", "Bearer fake-key-newest"]);
  });

  it("never reaches A's unlock from B's paired browser", async () => {
    const keys = secretKeys();
    await keys.createKey({ name: "DeepSeek", kind: "llm", provider: "deepseek", value: "fake-key-A", authorizationPassword: PASSWORD_A, createdBy: "user.A" });
    await keys.unlockSession({ sessionId: "sess.A", userId: "user.A", authorizationPassword: PASSWORD_A, expiresAtMs: later() });
    const { fetchImpl, bearers } = stubbedFetch();
    const resolve = createAutomationStudioSessionKeyProviderResolver({ ports: keys, fetchImpl });
    const asB = resolve({ projectId: "project.one", flowId: "flow.one", caller: { actorUserId: "user.B", actorSessionId: "client-gateway:gw.2" } })!;
    await expect(asB.provider.runTask(request())).rejects.toThrow();
    expect(bearers).toEqual([]);
    expect(keys.unlockedSessionFor("user.A")).toBe("sess.A");
  });
});

function ports(options: { locked?: boolean; onReveal?: (input: { sessionId: string; userId: string }) => void } = {}): AutomationStudioSessionKeyPorts {
  return {
    snapshot: async () => ({ keys: [{ id: "key.one", kind: "llm", provider: "deepseek", enabled: true, updatedAtMs: 1 }] }),
    createSessionRevealAuthorization: async (input) => {
      if (options.locked) throw new Error("Secret key session unlock is unavailable.");
      options.onReveal?.({ sessionId: input.sessionId, userId: input.userId });
      return { authorizationId: "authorization.one", keyId: "key.one", keyUpdatedAtMs: 1 };
    },
    revealKeyWithAuthorization: async () => ({ value: "key-value" }),
    revokeRevealAuthorization: () => undefined
  };
}

function request(overrides: Partial<AutomationStudioLlmTaskRequest> = {}): AutomationStudioLlmTaskRequest {
  return {
    requestId: "request.one",
    idempotencyKey: "idempotency.one",
    timeoutMs: 20_000,
    estimatedInputTokens: 100,
    taskKind: "runtime_diagnosis",
    promptVersion: "automation-studio.runtime-diagnosis.v1",
    expectedOutput: "diagnosis",
    tokenLimits: { maxInputTokens: 8000, maxOutputTokens: 2000, maxTotalTokens: 10000 },
    maxEstimatedCostUsd: 0.25,
    context: {
      schemaVersion: "0.1",
      taskKind: "runtime_diagnosis",
      promptVersion: "automation-studio.runtime-diagnosis.v1",
      projectId: "project.one",
      flowId: "flow.one",
      instructions: { instructions: [], instructionIds: [], diagnostics: [], tokenBudget: 8000, estimatedTokens: 0 }
    },
    ...overrides
  };
}

function responseEnvelope(content: unknown): Response {
  return new Response(JSON.stringify({
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }],
    usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 }
  }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } });
}
