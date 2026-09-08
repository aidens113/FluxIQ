import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioLlmTaskRequest } from "./llm-harness.ts";
import { AutomationStudioLlmExecutionGrantService } from "./llm-execution-grants.ts";

afterEach(() => vi.useRealTimers());

describe("Automation Studio LLM execution grants", () => {
  it("issues only sanitized metadata without revealing or retaining a provider secret", async () => {
    const fixture = setup();
    const grant = await fixture.service.issue(issueInput());
    expect(JSON.stringify(grant)).not.toContain("test-secret");
    expect(JSON.stringify(fixture.service)).not.toContain("password");
    expect(grant).toMatchObject({
      provider: "deepseek",
      model: "deepseek-chat",
      purpose: "diagnosis_only",
      maxCalls: 1,
      maxEstimatedCostUsd: 0.25,
      remainingUses: 1,
      executionDigest: "execution-digest.one"
    });
    expect(fixture.revealAuthorizationCount).toBe(1);
    expect(fixture.revealCount).toBe(0);
    const storedGrant = [...(fixture.service as any).grants.values()][0];
    expect(storedGrant.revealAuthorizationIds).toHaveLength(1);
    expect(storedGrant).not.toHaveProperty("revealAuthorizationId");
    expect(storedGrant).not.toHaveProperty("authorizationPassword");
    expect(storedGrant).not.toHaveProperty("authorizationPin");

    const resolved = await fixture.service.resolve(resolveInput(grant.grantId));
    expect(fixture.revealCount).toBe(0);
    await expect(resolved.provider.runTask(request())).resolves.toMatchObject({ response: { kind: "diagnosis" } });
    expect(fixture.revealCount).toBe(1);
    await expect(fixture.service.resolve(resolveInput(grant.grantId))).rejects.toThrow("unavailable");
  });

  it("claims atomically before async validation and rejects concurrent resolution", async () => {
    const fixture = setup();
    const grant = await fixture.service.issue(issueInput());
    const first = fixture.service.resolve(resolveInput(grant.grantId));
    await expect(fixture.service.resolve(resolveInput(grant.grantId))).rejects.toThrow("unavailable");
    await expect(first).resolves.toMatchObject({ maxCallsPerRun: 1 });
  });

  it("rechecks active state after delayed just-in-time reveal crosses expiry", async () => {
    const fixture = setup();
    fixture.delayReveal = true;
    const grant = await fixture.service.issue({ ...issueInput(), ttlMs: 1000 });
    const resolved = await fixture.service.resolve(resolveInput(grant.grantId));
    const pending = resolved.provider.runTask(request());
    await fixture.revealStarted;
    fixture.now = 2001;
    fixture.releaseReveal();
    await expect(pending).rejects.toThrow("cancelled");
    expect(fixture.service.activeGrantCount()).toBe(0);
  });

  it("invalidates grants on scope, execution dependency digest, key changes, logout, and expiry", async () => {
    const fixture = setup();
    let grant = await fixture.service.issue(issueInput());
    await expect(fixture.service.resolve({ ...resolveInput(grant.grantId), flowId: "flow.other" })).rejects.toThrow("scope");
    grant = await fixture.service.issue(issueInput());
    fixture.key.updatedAtMs += 1;
    await expect(fixture.service.resolve(resolveInput(grant.grantId))).rejects.toThrow("no longer valid");
    fixture.key.updatedAtMs -= 1;
    grant = await fixture.service.issue(issueInput());
    fixture.executionDigest = "execution-digest.two";
    await expect(fixture.service.resolve(resolveInput(grant.grantId))).rejects.toThrow("no longer valid");
    fixture.executionDigest = "execution-digest.one";
    grant = await fixture.service.issue(issueInput());
    fixture.key.enabled = false;
    await expect(fixture.service.resolve(resolveInput(grant.grantId))).rejects.toThrow("no longer valid");
    fixture.key.enabled = true;
    grant = await fixture.service.issue(issueInput());
    fixture.sessionValid = false;
    await expect(fixture.service.resolve(resolveInput(grant.grantId))).rejects.toThrow("no longer valid");
    fixture.sessionValid = true;
    grant = await fixture.service.issue({ ...issueInput(), ttlMs: 1000 });
    fixture.now = 2001;
    await expect(fixture.service.resolve(resolveInput(grant.grantId))).rejects.toThrow("unavailable");
  });

  it("actively removes unused grants and their reveal authorizations on timer expiry and close", async () => {
    vi.useFakeTimers();
    const fixture = setup();
    await fixture.service.issue({ ...issueInput(), ttlMs: 1000 });
    expect(fixture.service.activeGrantCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fixture.service.activeGrantCount()).toBe(0);
    expect(fixture.revokeAuthorizationCount).toBe(1);
    await fixture.service.issue(issueInput());
    fixture.service.close();
    expect(fixture.service.activeGrantCount()).toBe(0);
    expect(fixture.revokeAuthorizationCount).toBe(2);
  });

  it("accepts bounded user limits and rejects values beyond hard ceilings", async () => {
    const fixture = setup();
    await expect(fixture.service.preflight({
      keyId: "secret:key",
      projectId: "project.one",
      flowId: "flow.one",
      provider: "deepseek",
      model: "deepseek-chat",
      tokenLimits: { maxInputTokens: 4000, maxOutputTokens: 1000, maxTotalTokens: 5000 },
      maxCalls: 1,
      maxEstimatedCostUsd: 0.1,
      timeoutMs: 10_000
    })).resolves.toMatchObject({
      tokenLimits: { maxInputTokens: 4000, maxOutputTokens: 1000, maxTotalTokens: 5000 },
      maxCalls: 1,
      maxEstimatedCostUsd: 0.1,
      timeoutMs: 10_000
    });
    await expect(fixture.service.preflight({ keyId: "secret:key", projectId: "project.one", flowId: "flow.one", tokenLimits: { maxTotalTokens: 50_001 } })).rejects.toThrow("token limits");
    await expect(fixture.service.preflight({ keyId: "secret:key", projectId: "project.one", flowId: "flow.one", maxCalls: 2 })).rejects.toThrow("exactly one");
    await expect(fixture.service.preflight({ keyId: "secret:key", projectId: "project.one", flowId: "flow.one", maxEstimatedCostUsd: 0.251 })).rejects.toThrow("cost");
  });

  it("issues revision-bound build_and_adapt grants with bounded sequential per-call authorization", async () => {
    const fixture = setup();
    fixture.exactBinding = true;
    const grant = await fixture.service.issue({
      ...issueInput(),
      purpose: "build_and_adapt",
      maxCalls: 3,
      maxUses: 3,
      maxEstimatedCostUsd: 0.1,
      maxTotalEstimatedCostUsd: 0.3,
      providerRetryCount: 0
    });
    expect(grant).toMatchObject({
      purpose: "build_and_adapt",
      keyUpdatedAtMs: 1,
      settingsRevision: 7,
      maxCalls: 3,
      remainingUses: 3,
      maxTotalEstimatedCostUsd: 0.3,
      providerRetryCount: 0
    });
    expect(fixture.revealAuthorizationCount).toBe(3);
    const storedGrant = [...(fixture.service as any).grants.values()][0];
    expect(storedGrant.revealAuthorizationIds).toHaveLength(3);
    expect(storedGrant).not.toHaveProperty("authorizationPassword");
    expect(storedGrant).not.toHaveProperty("authorizationPin");
    expect(storedGrant).not.toHaveProperty("secret");
    expect(storedGrant).not.toHaveProperty("value");

    const resolved = await fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "build_and_adapt" });
    expect(resolved).toMatchObject({ maxCallsPerRun: 3, maxTotalEstimatedCostUsd: 0.3, providerRetryCount: 0 });
    for (let index = 0; index < 3; index += 1) {
      await expect(resolved.provider.runTask({ ...request(), requestId: `request.${index}`, idempotencyKey: `request.${index}`, maxEstimatedCostUsd: 0.1 })).resolves.toBeDefined();
    }
    expect(fixture.revealCount).toBe(3);
    expect(fixture.service.activeGrantCount()).toBe(0);
  });

  it("inspects an available revision-bound build grant without claiming or revealing it", async () => {
    const fixture = setup();
    fixture.exactBinding = true;
    const grant = await fixture.service.issue({ ...issueInput(), purpose: "build_and_adapt", maxCalls: 2 });
    const revealCountBeforeInspection = fixture.revealCount;

    const inspected = await fixture.service.inspectAvailable({
      ...resolveInput(grant.grantId),
      purpose: "build_and_adapt"
    });

    expect(inspected).toMatchObject({
      grantId: grant.grantId,
      purpose: "build_and_adapt",
      executionDigest: "execution-digest.one",
      settingsRevision: 7,
      remainingUses: 2
    });
    expect(fixture.revealCount).toBe(revealCountBeforeInspection);
    expect(fixture.service.activeGrantCount()).toBe(1);
    await expect(fixture.service.resolve({
      ...resolveInput(grant.grantId),
      purpose: "build_and_adapt"
    })).resolves.toBeDefined();
    await expect(fixture.service.inspectAvailable({
      ...resolveInput(grant.grantId),
      purpose: "build_and_adapt"
    })).rejects.toThrow("unavailable");

    const wrongPurposeGrant = await fixture.service.issue({ ...issueInput(), purpose: "build_and_adapt", maxCalls: 1 });
    await expect(fixture.service.inspectAvailable({
      ...resolveInput(wrongPurposeGrant.grantId),
      purpose: "diagnosis_only"
    })).rejects.toThrow("scope mismatch");
    expect(fixture.service.activeGrantCount()).toBe(0);
  });
  it("rejects concurrent build calls atomically and invalidates on settings drift, cancellation, user, and session", async () => {
    const fixture = setup();
    fixture.exactBinding = true;
    fixture.delayReveal = true;
    let grant = await fixture.service.issue({ ...issueInput(), purpose: "build_and_adapt", maxCalls: 2, maxEstimatedCostUsd: 0.1, maxTotalEstimatedCostUsd: 0.2 });
    let resolved = await fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "build_and_adapt" });
    const pending = resolved.provider.runTask({ ...request(), maxEstimatedCostUsd: 0.1 });
    await fixture.revealStarted;
    await expect(resolved.provider.runTask({ ...request(), requestId: "request.concurrent", idempotencyKey: "request.concurrent", maxEstimatedCostUsd: 0.1 })).rejects.toThrow("call in progress");
    fixture.releaseReveal();
    await expect(pending).resolves.toBeDefined();

    fixture.delayReveal = false;
    fixture.settingsRevision += 1;
    await expect(resolved.provider.runTask({ ...request(), requestId: "request.drift", idempotencyKey: "request.drift", maxEstimatedCostUsd: 0.1 })).rejects.toThrow("no longer valid");
    fixture.settingsRevision -= 1;

    grant = await fixture.service.issue({ ...issueInput(), purpose: "build_and_adapt", maxCalls: 2 });
    fixture.service.cancel(grant.grantId);
    expect(fixture.service.activeGrantCount()).toBe(0);
    grant = await fixture.service.issue({ ...issueInput(), purpose: "build_and_adapt", maxCalls: 2 });
    fixture.service.revokeForUser("user.one");
    expect(fixture.service.activeGrantCount()).toBe(0);
    grant = await fixture.service.issue({ ...issueInput(), purpose: "build_and_adapt", maxCalls: 2 });
    fixture.service.revokeForSession("session.one");
    expect(fixture.service.activeGrantCount()).toBe(0);
  });

  it("authorizes flow_bootstrap only for build_and_adapt", async () => {
    const fixture = setup();
    fixture.exactBinding = true;
    const buildGrant = await fixture.service.issue({ ...issueInput(), purpose: "build_and_adapt", maxCalls: 1 });
    const build = await fixture.service.resolve({ ...resolveInput(buildGrant.grantId), purpose: "build_and_adapt" });
    await expect(build.provider.runTask({ ...request(), taskKind: "flow_bootstrap", expectedOutput: "flow_bootstrap" })).rejects.toMatchObject({ code: "llm.provider_configuration_invalid" });

    const diagnosisGrant = await fixture.service.issue(issueInput());
    const diagnosis = await fixture.service.resolve(resolveInput(diagnosisGrant.grantId));
    await expect(diagnosis.provider.runTask({ ...request(), taskKind: "flow_bootstrap", expectedOutput: "flow_bootstrap" })).rejects.toThrow("request mismatch");
  });

  it("supports a production bootstrap-only resolve policy while later adaptation tasks remain gated", async () => {
    const fixture = setup();
    fixture.exactBinding = true;
    let grant = await fixture.service.issue({ ...issueInput(), purpose: "build_and_adapt", maxCalls: 2 });
    let resolved = await fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "build_and_adapt" }, { allowedTaskKinds: ["flow_bootstrap"] });
    await expect(resolved.provider.runTask(request())).rejects.toThrow("request mismatch");

    grant = await fixture.service.issue({ ...issueInput(), purpose: "build_and_adapt", maxCalls: 2 });
    resolved = await fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "build_and_adapt" }, { allowedTaskKinds: ["flow_bootstrap"] });
    await expect(resolved.provider.runTask({ ...request(), taskKind: "flow_bootstrap", expectedOutput: "flow_bootstrap" })).rejects.toMatchObject({ code: "llm.provider_configuration_invalid" });
  });

  it("rejects arbitrary runtime purposes before they can obtain build permissions or bypass revision binding", async () => {
    const fixture = setup();
    await expect(fixture.service.preflight({ ...issueInput(), purpose: "arbitrary_authoring" as any })).rejects.toThrow("purpose is unsupported");
    const grant = await fixture.service.issue(issueInput());
    await expect(fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "arbitrary_authoring" as any })).rejects.toThrow("purpose is unsupported");
  });

  it("does not commit a revealed in-flight result after cancellation, expiry, or dependency/settings drift", async () => {
    const fixture = setup();
    fixture.exactBinding = true;

    fixture.delayProvider = true;
    let grant = await fixture.service.issue({ ...issueInput(), purpose: "build_and_adapt", maxCalls: 2, maxEstimatedCostUsd: 0.1 });
    let resolved = await fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "build_and_adapt" });
    let pending = resolved.provider.runTask({ ...request(), maxEstimatedCostUsd: 0.1 });
    await fixture.providerStarted;
    expect(fixture.revealCount).toBe(1);
    fixture.service.cancel(grant.grantId);
    await expect(pending).rejects.toThrow();
    expect(fixture.service.activeGrantCount()).toBe(0);
    fixture.releaseProvider();

    vi.useFakeTimers();
    fixture.delayProvider = true;
    fixture.now = 1;
    grant = await fixture.service.issue({ ...issueInput(), purpose: "build_and_adapt", maxCalls: 2, ttlMs: 1000, maxEstimatedCostUsd: 0.1 });
    resolved = await fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "build_and_adapt" });
    pending = resolved.provider.runTask({ ...request(), requestId: "request.expiry", idempotencyKey: "request.expiry", maxEstimatedCostUsd: 0.1 });
    await fixture.providerStarted;
    const expiryRejection = expect(pending).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(1000);
    await expiryRejection;
    expect(fixture.service.activeGrantCount()).toBe(0);
    fixture.releaseProvider();
    vi.useRealTimers();

    fixture.delayProvider = true;
    fixture.now = 1;
    grant = await fixture.service.issue({ ...issueInput(), purpose: "build_and_adapt", maxCalls: 2, maxEstimatedCostUsd: 0.1 });
    resolved = await fixture.service.resolve({ ...resolveInput(grant.grantId), purpose: "build_and_adapt" });
    pending = resolved.provider.runTask({ ...request(), requestId: "request.drift-after-reveal", idempotencyKey: "request.drift-after-reveal", maxEstimatedCostUsd: 0.1 });
    await fixture.providerStarted;
    fixture.executionDigest = "execution-digest.changed";
    fixture.settingsRevision += 1;
    fixture.releaseProvider();
    await expect(pending).rejects.toThrow("no longer valid");
    expect(fixture.service.activeGrantCount()).toBe(0);
  });

  it("fails build_and_adapt closed without an exact settings revision and rejects unsafe limits or retries", async () => {
    const fixture = setup();
    await expect(fixture.service.preflight({ ...issueInput(), purpose: "build_and_adapt" })).rejects.toThrow("settings revision");
    fixture.exactBinding = true;
    await expect(fixture.service.preflight({ ...issueInput(), purpose: "build_and_adapt", maxCalls: 9 })).rejects.toThrow("call limit");
    await expect(fixture.service.preflight({ ...issueInput(), purpose: "build_and_adapt", providerRetryCount: 1 })).rejects.toThrow("retries");
    await expect(fixture.service.preflight({ ...issueInput(), purpose: "build_and_adapt", maxTotalEstimatedCostUsd: Number.POSITIVE_INFINITY })).rejects.toThrow("total estimated-cost");
    await expect(fixture.service.preflight({ ...issueInput(), purpose: "build_and_adapt", tokenLimits: { maxTotalTokens: 50_001 } })).rejects.toThrow("token limits");
  });

  it("requires configured password and PIN and rejects incompatible provider metadata", async () => {
    const fixture = setup();
    await expect(fixture.service.preflight({ keyId: "secret:key", projectId: "project.one", flowId: "flow.one", provider: "other" })).rejects.toThrow("provider");
    await expect(fixture.service.issue({ ...issueInput(), maxUses: 2 })).rejects.toThrow("one-use");
    fixture.pinConfigured = false;
    await expect(fixture.service.issue(issueInput())).rejects.toThrow("configured password and PIN");
  });
});

function setup() {
  const key: any = { id: "secret:key", name: "DeepSeek", kind: "llm", provider: "deepseek", scope: "flow", scopeRef: "flow.one", enabled: true, createdAtMs: 1, updatedAtMs: 1, lastRotatedAtMs: 1, metadata: { model: "deepseek-chat" } };
  let now = 1;
  let sessionValid = true;
  let pinConfigured = true;
  let executionDigest = "execution-digest.one";
  let settingsRevision = 7;
  let exactBinding = false;
  let revealAuthorizationCount = 0;
  let revealCount = 0;
  let revokeAuthorizationCount = 0;
  let delayReveal = false;
  let releaseReveal = () => {};
  let startReveal = () => {};
  let revealWait = Promise.resolve();
  let revealStarted = Promise.resolve();
  let delayProvider = false;
  let releaseProvider = () => {};
  let startProvider = () => {};
  let providerWait = Promise.resolve();
  let providerStarted = Promise.resolve();
  const resetProviderGate = () => {
    providerStarted = new Promise<void>((resolve) => { startProvider = resolve; });
    providerWait = new Promise<void>((resolve) => { releaseProvider = resolve; });
  };
  const resetRevealGate = () => {
    revealStarted = new Promise<void>((resolve) => { startReveal = resolve; });
    revealWait = new Promise<void>((resolve) => { releaseReveal = resolve; });
  };
  const fixture: any = {
    key,
    get now() { return now; },
    set now(value: number) { now = value; },
    get sessionValid() { return sessionValid; },
    set sessionValid(value: boolean) { sessionValid = value; },
    get pinConfigured() { return pinConfigured; },
    set pinConfigured(value: boolean) { pinConfigured = value; },
    get executionDigest() { return executionDigest; },
    set executionDigest(value: string) { executionDigest = value; },
    get settingsRevision() { return settingsRevision; },
    set settingsRevision(value: number) { settingsRevision = value; },
    get exactBinding() { return exactBinding; },
    set exactBinding(value: boolean) { exactBinding = value; },
    get revealAuthorizationCount() { return revealAuthorizationCount; },
    get revealCount() { return revealCount; },
    get revokeAuthorizationCount() { return revokeAuthorizationCount; },
    get delayReveal() { return delayReveal; },
    set delayReveal(value: boolean) {
      delayReveal = value;
      if (value) resetRevealGate();
    },
    get revealStarted() { return revealStarted; },
    releaseReveal: () => releaseReveal(),
    get delayProvider() { return delayProvider; },
    set delayProvider(value: boolean) {
      delayProvider = value;
      if (value) resetProviderGate();
    },
    get providerStarted() { return providerStarted; },
    releaseProvider: () => releaseProvider()
  };
  fixture.service = new AutomationStudioLlmExecutionGrantService({
    now: () => now,
    resolveExecutionDigest: async (_projectId: string, flowId: string) => {
      if (flowId !== "flow.one") throw new Error("Unknown Flow");
      return exactBinding ? { executionDigest, settingsRevision } : executionDigest;
    },
    identityAccess: {
      authorizeSessionPasswordPin: async () => ({ id: "user.one", passwordConfigured: true, pinConfigured }),
      validateSession: async () => sessionValid ? { user: { id: "user.one", passwordConfigured: true, pinConfigured }, session: {}, role: {} } : null
    } as any,
    secretKeys: {
      getKeySummary: async () => ({ ...key }),
      createRevealAuthorization: async (input: { ttlMs?: number }) => {
        revealAuthorizationCount += 1;
        return { authorizationId: `secret-reveal:${revealAuthorizationCount}`, keyId: key.id, keyUpdatedAtMs: key.updatedAtMs, expiresAtMs: now + (input.ttlMs ?? 60_000), remainingUses: 1 };
      },
      revealKeyWithAuthorization: async () => {
        revealCount += 1;
        if (delayReveal) {
          startReveal();
          await revealWait;
        }
        return { key: { ...key }, value: "test-secret" };
      },
      revokeRevealAuthorization: () => { revokeAuthorizationCount += 1; }
    } as any,
    fetchImpl: (async (_input: unknown, init?: RequestInit) => {
      if (delayProvider) {
        startProvider();
        await new Promise<void>((resolve, reject) => {
          const aborted = () => reject(new Error("provider aborted"));
          init?.signal?.addEventListener("abort", aborted, { once: true });
          providerWait.then(() => {
            init?.signal?.removeEventListener("abort", aborted);
            resolve();
          }, reject);
        });
      }
      return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ kind: "diagnosis", summary: "safe" }) } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch
  });
  return fixture as {
    service: AutomationStudioLlmExecutionGrantService;
    key: any;
    now: number;
    sessionValid: boolean;
    pinConfigured: boolean;
    executionDigest: string;
    settingsRevision: number;
    exactBinding: boolean;
    revealAuthorizationCount: number;
    revealCount: number;
    revokeAuthorizationCount: number;
    delayReveal: boolean;
    revealStarted: Promise<void>;
    releaseReveal: () => void;
    delayProvider: boolean;
    providerStarted: Promise<void>;
    releaseProvider: () => void;
  };
}

function issueInput() {
  return { actorUserId: "user.one", actorSessionId: "session.one", authorizationPassword: "password", authorizationPin: "123456", keyId: "secret:key", projectId: "project.one", flowId: "flow.one", provider: "deepseek", model: "deepseek-chat" };
}
function resolveInput(grantId: string) {
  return { grantId, actorUserId: "user.one", actorSessionId: "session.one", projectId: "project.one", flowId: "flow.one", purpose: "diagnosis_only" as const };
}
function request(): AutomationStudioLlmTaskRequest {
  return { requestId: "request.one", idempotencyKey: "request.one", timeoutMs: 20000, estimatedInputTokens: 100, maxEstimatedCostUsd: 0.25, taskKind: "runtime_diagnosis", promptVersion: "v1", expectedOutput: "diagnosis", tokenLimits: { maxInputTokens: 8000, maxOutputTokens: 2000, maxTotalTokens: 10000 }, context: { schemaVersion: "0.1", taskKind: "runtime_diagnosis", promptVersion: "v1", projectId: "project.one", flowId: "flow.one", instructions: { instructions: [], instructionIds: [], diagnostics: [], tokenBudget: 8000, estimatedTokens: 0 } } };
}