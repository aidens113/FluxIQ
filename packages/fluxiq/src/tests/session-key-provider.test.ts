import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioLlmTaskRequest } from "../runtime/llm/harness/index.ts";
import type { AutomationStudioSessionKeyPorts } from "../runtime/llm/deepseek/index.ts";
import { AUTOMATION_STUDIO_DEEPSEEK_MODEL_LIMITS, AUTOMATION_STUDIO_DEEPSEEK_MODELS } from "../runtime/llm/deepseek/index.ts";
import { AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_USD, automationStudioLlmResolutionWithinFlowSettings } from "../runtime/llm/flow-execution-limits/index.ts";
import { AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS, createAutomationStudioSessionKeyProviderResolver } from "../runtime/llm/index.ts";
import { AutomationStudioSecretsLockedError } from "../runtime/llm/deepseek/index.ts";
import { automationStudioPersonWaitClock } from "../runtime/models/secrets/index.ts";
import { IdentityAccessService } from "../programs/identity-access/index.ts";
import { SecretKeysService } from "../programs/secret-keys/index.ts";
import { DIAGNOSIS, envelope, jsonReply, textFor } from "../runtime/llm/anthropic/tests/fixtures.ts";
import type { AutomationStudioLlmProviderResolverInput } from "../runtime/llm/index.ts";

const WEAK_KDF = { testOnlyWeakParameters: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } as const };
const PASSWORD_A = "dummy-password-a";

// A model call made for a person needs no grant: nothing is issued, held or
// checked first. The call runs on the person's own key, released per call to
// their unlocked session, and fails only when that key cannot be released.

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("a task whose person's key locks mid-way", () => {
  it("waits for the person before its attempt, tells the host, and carries on when they unlock", async () => {
    const service = new SecretKeysService({ passwordKdf: WEAK_KDF });
    const key = await service.createKey({ name: "DeepSeek", value: "dummy-wait-key", authorizationPassword: PASSWORD_A, createdBy: "user.wait" });
    const events: string[] = [];
    const seen: string[] = [];
    const resolve = createAutomationStudioSessionKeyProviderResolver({
      ports: service,
      flowSecretKeyId: () => key.id,
      fetchImpl: (async (_url: unknown, init: { headers?: Record<string, string> }) => {
        seen.push(new Headers(init.headers).get("authorization") ?? "");
        return responseEnvelope({ kind: "diagnosis", summary: "Fine." });
      }) as unknown as typeof fetch,
      onKeyWait: ({ phase, status, waitingFor }) => void events.push(`${phase}:${status}:${waitingFor}`)
    });
    const resolution = resolve({ projectId: "project.one", flowId: "flow.one", caller: { actorUserId: "user.wait", actorSessionId: "session.wait" } });
    const provider = resolution!.provider;
    expect(provider.whenReady).toBeTypeOf("function");
    let ready = false;
    const waiting = provider.whenReady!(request()).then(() => {
      ready = true;
    });
    await vi.waitFor(() => expect(events).toEqual(["waiting:waiting_for_person:model_key_locked"]));
    expect(ready).toBe(false);
    expect(seen).toEqual([]);
    // The wait is on the record for the limits on this Flow's work, and on nobody else's.
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(automationStudioPersonWaitClock.heldMs({ projectId: "project.one", flowId: "flow.one" })).toBeGreaterThan(0);
    expect(automationStudioPersonWaitClock.heldMs({ projectId: "project.one", flowId: "flow.other" })).toBe(0);

    await service.unlockSession({ sessionId: "session.wait", userId: "user.wait", authorizationPassword: PASSWORD_A, expiresAtMs: Date.now() + 60_000 });
    await waiting;
    expect(events.at(-1)).toBe("resumed:waiting_for_person:model_key_locked");
    await expect(provider.runTask(request())).resolves.toBeDefined();
    expect(seen).toEqual(["Bearer dummy-wait-key"]);
    service.close();
  });
});

describe("a task whose key locks, as its own provider says", () => {
  it("tells what listens to this provider when a call starts and stops waiting, and on a Stop too", async () => {
    const service = new SecretKeysService({ passwordKdf: WEAK_KDF });
    const key = await service.createKey({ name: "DeepSeek", value: "dummy-wait-key", authorizationPassword: PASSWORD_A, createdBy: "user.hold" });
    const resolve = createAutomationStudioSessionKeyProviderResolver({ ports: service, flowSecretKeyId: () => key.id });
    const provider = resolve({ projectId: "project.hold", flowId: "flow.hold", caller: { actorUserId: "user.hold", actorSessionId: "session.hold" } })!.provider;
    const heard: string[] = [];
    const stop = provider.observeHolds!((state) => void heard.push(state));
    const waiting = provider.whenReady!(request());
    await vi.waitFor(() => expect(heard).toEqual(["started"]));
    await service.unlockSession({ sessionId: "session.hold", userId: "user.hold", authorizationPassword: PASSWORD_A, expiresAtMs: Date.now() + 60_000 });
    await waiting;
    expect(heard).toEqual(["started", "ended"]);
    service.revokeSessionUnlock("session.hold", { userId: "user.hold", administrator: false });
    const aborted = new AbortController();
    const stopped = provider.whenReady!(request(), { signal: aborted.signal });
    await vi.waitFor(() => expect(heard).toEqual(["started", "ended", "started"]));
    aborted.abort();
    await stopped;
    expect(heard).toEqual(["started", "ended", "started", "ended"]);
    stop();
    service.close();
  });
});

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
    const scoped = await import("../runtime/llm/index.ts");
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

  it("uses the Flow's configured model and refuses an unknown one", () => {
    const resolve = createAutomationStudioSessionKeyProviderResolver({ ports: ports() });
    const caller = { actorUserId: "user.one", actorSessionId: "session.one" };
    expect(resolve({ projectId: "p", flowId: "f", caller, modelId: "deepseek-flash" })!.provider.metadata).toMatchObject({ provider: "deepseek", model: "deepseek-flash" });
    expect(() => resolve({ projectId: "p", flowId: "f", caller, modelId: "not-a-model" })).toThrow(/Unsupported/);
  });

  it.each<Pick<AutomationStudioLlmProviderResolverInput, "providerId" | "metadata">>([
    { providerId: "host" },
    { metadata: { llmProvider: "host" } },
    { providerId: "host", metadata: { llmProvider: "host" } }
  ])("treats the persisted host selector as unspecified: %j", (selection) => {
    const resolve = createAutomationStudioSessionKeyProviderResolver({ ports: ports() });
    const scope = { projectId: "project.one", flowId: "flow.one", caller: { actorUserId: "user.one", actorSessionId: "session.one" } };
    expect(resolve({ ...scope, ...selection })!.provider.metadata).toEqual(resolve(scope)!.provider.metadata);
  });

  it("uses the explicit Claude model and named key through a legacy host selection", async () => {
    const model = "claude-haiku-5-5";
    const chosenId = "secret:claude-chosen";
    const reveals: string[] = [];
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body)).model).toBe(model);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fake-claude-chosen");
      return jsonReply(envelope(textFor(DIAGNOSIS), { model }));
    });
    const resolve = createAutomationStudioSessionKeyProviderResolver({
      ports: {
        snapshot: async () => ({ keys: [
          { id: "secret:claude-newest", kind: "llm", provider: "anthropic", enabled: true, updatedAtMs: 2, metadata: { model } },
          { id: chosenId, kind: "llm", provider: "anthropic", enabled: true, updatedAtMs: 1, metadata: { model } }
        ] }),
        createSessionRevealAuthorization: async (input) => ({ authorizationId: "reveal.chosen", keyId: input.id, keyUpdatedAtMs: 1 }),
        revealKeyWithAuthorization: async (input) => {
          reveals.push(input.id);
          return { value: "fake-claude-chosen" };
        },
        revokeRevealAuthorization: () => undefined
      },
      fetchImpl: fetchImpl as typeof fetch
    });
    const resolved = resolve({
      projectId: "project.one", flowId: "flow.one", caller: { actorUserId: "user.one", actorSessionId: "session.one" },
      providerId: "host", metadata: { llmProvider: "host", llmModel: model, llmSecretKeyId: chosenId }
    })!;
    expect(resolved.provider.metadata).toMatchObject({ provider: "anthropic", model });
    await expect(resolved.provider.runTask(request())).resolves.toMatchObject({ response: DIAGNOSIS });
    expect(reveals).toEqual([chosenId]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each<Pick<AutomationStudioLlmProviderResolverInput, "providerId" | "modelId" | "metadata">>([
    { providerId: "policy.checkout" },
    { metadata: { llmProvider: "unknown" } },
    { providerId: "host", metadata: { llmProvider: "unknown" } },
    { providerId: "deepseek", modelId: "claude-haiku-5-5" }
  ])("refuses invalid concrete provider/model bindings before releasing a key or fetching: %j", (selection) => {
    const keys = ports();
    const snapshot = vi.fn(keys.snapshot);
    const reveal = vi.fn(keys.revealKeyWithAuthorization);
    const fetchImpl = vi.fn();
    const resolve = createAutomationStudioSessionKeyProviderResolver({ ports: { ...keys, snapshot, revealKeyWithAuthorization: reveal }, fetchImpl: fetchImpl as typeof fetch });
    expect(() => resolve({ projectId: "project.one", flowId: "flow.one", caller: { actorUserId: "user.one", actorSessionId: "session.one" }, ...selection })).toThrow();
    expect(snapshot).not.toHaveBeenCalled();
    expect(reveal).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
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
    expect(failure).toMatchObject({ code: "secrets.locked", message: "Unlock your model key: open app.example.test and enter your password once" });
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
