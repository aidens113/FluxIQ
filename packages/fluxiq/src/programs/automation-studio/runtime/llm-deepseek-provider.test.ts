import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmTaskRequest } from "./llm-harness.ts";
import {
  AUTOMATION_STUDIO_DEEPSEEK_CHAT_COMPLETIONS_URL,
  createAutomationStudioDeepSeekProvider
} from "./llm-deepseek-provider.ts";
import { AutomationStudioLlmProviderError, type AutomationStudioLlmProviderErrorCode } from "./llm-provider-contract.ts";

describe("Automation Studio DeepSeek provider", () => {
  it("uses the fixed endpoint, explicit model/max_tokens, opaque secret resolver, request IDs, and no redirects", async () => {
    let requestedUrl = "";
    let requestedInit: RequestInit | undefined;
    const secretRequests: unknown[] = [];
    const provider = createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:deepseek" },
      resolveSecret: async (input) => {
        secretRequests.push(input);
        return "test-secret";
      },
      fetchImpl: (async (url, init) => {
        requestedUrl = String(url);
        requestedInit = init;
        return responseEnvelope({ kind: "diagnosis", summary: "A bounded diagnosis.", confidence: 0.9 }, { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 });
      }) as typeof fetch
    });

    const result = await provider.runTask(request()) as { response: unknown; usage: unknown };

    expect(requestedUrl).toBe(AUTOMATION_STUDIO_DEEPSEEK_CHAT_COMPLETIONS_URL);
    expect(requestedInit).toMatchObject({ method: "POST", redirect: "manual" });
    expect(new Headers(requestedInit?.headers).get("authorization")).toBe("Bearer test-secret");
    expect(new Headers(requestedInit?.headers).get("x-request-id")).toBe("request.one");
    expect(new Headers(requestedInit?.headers).get("idempotency-key")).toBe("idempotency.one");
    expect(JSON.parse(String(requestedInit?.body))).toMatchObject({ model: "deepseek-chat", max_tokens: 2000, stream: false });
    expect(secretRequests).toEqual([expect.objectContaining({ secretReference: "secret:deepseek", projectId: "project.one", flowId: "flow.one", requestId: "request.one" })]);
    expect(result).toMatchObject({ response: { kind: "diagnosis" }, usage: { inputTokens: 12, outputTokens: 5, totalTokens: 17 } });
  });

  it.each([
    [401, "llm.provider_auth_failed"],
    [403, "llm.provider_auth_failed"],
    [429, "llm.provider_rate_limited"],
    [500, "llm.provider_http_error"]
  ] as const)("normalizes HTTP %s without retrying", async (status, code) => {
    let calls = 0;
    const provider = createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:deepseek" },
      resolveSecret: async () => "test-secret",
      fetchImpl: (async () => {
        calls += 1;
        return new Response("provider detail", { status });
      }) as typeof fetch
    });

    await expectProviderError(provider.runTask(request()), code);
    expect(calls).toBe(1);
  });

  it("rejects redirects at the fixed endpoint", async () => {
    const provider = createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:deepseek" },
      resolveSecret: async () => "test-secret",
      fetchImpl: (async () => new Response(null, { status: 302, headers: { location: "https://example.invalid/" } })) as typeof fetch
    });
    await expectProviderError(provider.runTask(request()), "llm.provider_redirect_rejected");
  });

  it("rejects off-origin responses and fatal UTF-8 before structured parsing", async () => {
    const offOrigin = new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    Object.defineProperty(offOrigin, "url", { value: "https://example.invalid/chat/completions" });
    await expectProviderError(providerForResponse(() => offOrigin).runTask(request()), "llm.provider_redirect_rejected");
    const invalidUtf8 = providerForResponse(() => new Response(new Uint8Array([0xff]), { status: 200, headers: { "content-type": "application/json" } }));
    await expectProviderError(invalidUtf8.runTask(request()), "llm.provider_malformed_response");
  });

  it("rejects invalid direct-call budgets before resolving a secret", async () => {
    let secretCalls = 0;
    const provider = createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:deepseek" },
      resolveSecret: async () => { secretCalls += 1; return "test-secret"; },
      fetchImpl: (async () => { throw new Error("must not run"); }) as typeof fetch
    });
    await expectProviderError(provider.runTask(request({ tokenLimits: { maxInputTokens: 1, maxOutputTokens: 1, maxTotalTokens: 2 } })), "llm.provider_configuration_invalid");
    expect(secretCalls).toBe(0);
    expect(() => createAutomationStudioDeepSeekProvider({
      secretReference: "sk-raw-secret" as any,
      resolveSecret: async () => "test-secret"
    })).toThrowError(AutomationStudioLlmProviderError);
  });

  it("rejects an outbound body containing the resolved credential literal", async () => {
    let transportCalls = 0;
    const provider = createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:deepseek" },
      resolveSecret: async () => "credential-literal",
      fetchImpl: (async () => { transportCalls += 1; throw new Error("must not run"); }) as typeof fetch
    });
    const credentialContext = request();
    credentialContext.context.metadata = { accidentalValue: "credential-literal" };
    await expectProviderError(provider.runTask(credentialContext), "llm.provider_configuration_invalid");
    expect(transportCalls).toBe(0);
  });

  it("normalizes timeout and caller abort separately", async () => {
    const fetchOnAbort = (async (_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) reject(new DOMException("aborted", "AbortError"));
      else signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    })) as typeof fetch;
    const provider = createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:deepseek" },
      resolveSecret: async () => "test-secret",
      fetchImpl: fetchOnAbort
    });

    await expectProviderError(provider.runTask(request({ timeoutMs: 5 })), "llm.provider_timeout");
    const controller = new AbortController();
    controller.abort();
    await expectProviderError(provider.runTask(request(), { signal: controller.signal }), "llm.provider_aborted");
  });

  it("rejects malformed JSON, non-JSON content, oversize bodies, and inconsistent usage", async () => {
    const malformedJson = providerForResponse(() => new Response("{", { status: 200 }));
    await expectProviderError(malformedJson.runTask(request()), "llm.provider_malformed_response");

    const nonJsonContent = providerForResponse(() => responseEnvelope("not-json", { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }, false));
    await expectProviderError(nonJsonContent.runTask(request()), "llm.provider_malformed_response");

    const oversize = createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:deepseek" },
      resolveSecret: async () => "test-secret",
      maxResponseBytes: 16,
      fetchImpl: (async () => new Response("x".repeat(17), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch
    });
    await expectProviderError(oversize.runTask(request()), "llm.provider_response_oversize");

    const invalidUsage = providerForResponse(() => responseEnvelope({ kind: "diagnosis", summary: "Diagnosis." }, { prompt_tokens: 2, completion_tokens: 3, total_tokens: 99 }));
    await expectProviderError(invalidUsage.runTask(request()), "llm.provider_usage_invalid");
    const overLimitUsage = providerForResponse(() => responseEnvelope({ kind: "diagnosis", summary: "Diagnosis." }, { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 }));
    await expectProviderError(overLimitUsage.runTask(request({ tokenLimits: { maxInputTokens: 8000, maxOutputTokens: 2, maxTotalTokens: 8002 } })), "llm.provider_usage_invalid");
  });

  it("rejects missing secrets and unsupported model/response bounds without transport", async () => {
    const missing = createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:deepseek" },
      resolveSecret: async () => "",
      fetchImpl: (async () => { throw new Error("must not run"); }) as typeof fetch
    });
    await expectProviderError(missing.runTask(request()), "llm.provider_secret_unavailable");
    await expectProviderError(missing.runTask(request({ timeoutMs: 30_000 })), "llm.provider_configuration_invalid");
    expect(() => createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:deepseek" },
      resolveSecret: async () => "test-secret",
      model: "deepseek-reasoner" as "deepseek-chat"
    })).toThrowError(AutomationStudioLlmProviderError);
    expect(() => createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:deepseek" },
      resolveSecret: async () => "test-secret",
      maxResponseBytes: 3_000_000
    })).toThrowError(AutomationStudioLlmProviderError);
  });
});

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

function providerForResponse(response: () => Response) {
  return createAutomationStudioDeepSeekProvider({
    secretReference: { kind: "secret_reference", id: "secret:deepseek" },
    resolveSecret: async () => "test-secret",
    fetchImpl: (async () => response()) as typeof fetch
  });
}

function responseEnvelope(content: unknown, usage: unknown, encodeContent = true): Response {
  return new Response(JSON.stringify({
    choices: [{ finish_reason: "stop", message: { content: encodeContent ? JSON.stringify(content) : content } }],
    usage
  }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } });
}

async function expectProviderError(promise: Promise<unknown>, code: AutomationStudioLlmProviderErrorCode): Promise<void> {
  try {
    await promise;
    throw new Error("Expected provider request to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(AutomationStudioLlmProviderError);
    expect((error as AutomationStudioLlmProviderError).code).toBe(code);
  }
}
