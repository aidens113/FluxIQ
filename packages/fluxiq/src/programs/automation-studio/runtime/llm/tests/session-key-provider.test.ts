import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmTaskRequest } from "../harness.ts";
import type { AutomationStudioSessionKeyPorts } from "../deepseek/index.ts";
import { AUTOMATION_STUDIO_DEEPSEEK_MODEL_LIMITS, AUTOMATION_STUDIO_DEEPSEEK_MODELS } from "../deepseek/index.ts";
import { AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS, createAutomationStudioSessionKeyProviderResolver } from "../session-key-provider.ts";

// A model call made for a person needs no grant: nothing is issued, held or
// checked first. The call runs on the person's own key, released per call to
// their unlocked session, and fails only when that key cannot be released.

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
    expect(resolution).toMatchObject({ timeoutMs: AUTOMATION_STUDIO_SESSION_KEY_PROVIDER_DEFAULTS.timeoutMs, maxEstimatedCostUsd: 0.25, maxTotalEstimatedCostUsd: 0.25 });
    const first = await resolution!.provider.runTask(request()) as { response: unknown };
    await resolution!.provider.runTask(request({ requestId: "request.two", idempotencyKey: "idempotency.two" }));
    expect(first.response).toMatchObject({ kind: "diagnosis" });
    expect(authorization).toBe("Bearer key-value");
    // One release per call, each to the caller's own session; nothing held between.
    expect(reveals).toEqual([{ sessionId: "session.one", userId: "user.one" }, { sessionId: "session.one", userId: "user.one" }]);
  });

  // The one per-request limit is the model's context window (2026-09-30): the
  // profile is the whole window, the reply reserved out of it.
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
