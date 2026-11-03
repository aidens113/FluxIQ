// An empty DeepSeek account is its own provider code: `llm.provider_balance_exhausted`,
// never retried, ending the model's calls -- from the Flow adapter and from the
// chat window's call alike. Fake fetches only; no key or provider body is real.

import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmTaskRequest } from "../../harness.ts";
import { AutomationStudioLlmProviderError, normalizedAutomationStudioLlmProviderFailure } from "../../provider-contract.ts";
import { automationStudioLlmProviderErrorSpendsCall, automationStudioLlmProviderFailureSpendsCall } from "../../failure-disposition.ts";
import { automationStudioDeepSeekBalanceExhausted } from "../balance-exhausted.ts";
import { createAutomationStudioDeepSeekPanelCommandModel, createAutomationStudioDeepSeekProvider } from "../index.ts";

const SECRET = "test-secret-value";

describe("an exhausted DeepSeek balance", () => {
  it("is read from a 402, or from a refusal whose own words say the balance, quota or credit is insufficient", () => {
    expect(automationStudioDeepSeekBalanceExhausted(402, null)).toBe(true);
    expect(automationStudioDeepSeekBalanceExhausted(400, { message: "Insufficient Balance" })).toBe(true);
    expect(automationStudioDeepSeekBalanceExhausted(429, { code: "insufficient_quota" })).toBe(true);
    expect(automationStudioDeepSeekBalanceExhausted(403, { type: "insufficient_credits" })).toBe(true);
    expect(automationStudioDeepSeekBalanceExhausted(400, { code: "invalid_value", message: "max_tokens must be at most 8192" })).toBe(false);
    expect(automationStudioDeepSeekBalanceExhausted(429, null)).toBe(false);
  });

  it("is its own code from the Flow adapter, not retryable, and ends the model's calls", async () => {
    const failure = await refusedWith(402, { error: { message: "Insufficient Balance", type: "unknown_error", code: "invalid_request_error" } });

    expect(failure).toBeInstanceOf(AutomationStudioLlmProviderError);
    expect(failure).toMatchObject({ code: "llm.provider_balance_exhausted", retryable: false, status: 402 });
    const normalized = normalizedAutomationStudioLlmProviderFailure(failure);
    expect(normalized).toMatchObject({ code: "llm.provider_balance_exhausted", retryable: false, status: 402, provenance: { providerInvocation: "attempted", providerResponse: "received" } });
    expect(normalized.message).not.toContain("Insufficient Balance");
    expect(automationStudioLlmProviderErrorSpendsCall(failure)).toBe(false);
    expect(automationStudioLlmProviderFailureSpendsCall({ code: "llm.provider_balance_exhausted", status: 402 })).toBe(false);
  });

  it("is read from the refusal's words under another status, and leaves a plain 400 an HTTP failure", async () => {
    expect(await refusedWith(429, { error: { message: "You exceeded your current quota.", code: "insufficient_quota" } })).toMatchObject({ code: "llm.provider_balance_exhausted", status: 429 });
    expect(await refusedWith(400, { error: { message: "Bad request.", code: "invalid_request" } })).toMatchObject({ code: "llm.provider_http_error", status: 400 });
  });

  it("is its own code from the chat window's call too", async () => {
    const model = createAutomationStudioDeepSeekPanelCommandModel({
      resolveKey: async () => SECRET,
      fetchImpl: (async () => new Response(JSON.stringify({ error: { message: "Insufficient Balance" } }), { status: 402, headers: { "content-type": "application/json" } })) as unknown as typeof fetch
    });
    const decided = model.decide(
      { instructions: "You can operate the FluxIQ control panel.", transcript: [], message: "run my flow", correction: null },
      { signal: new AbortController().signal, caller: null }
    );
    await expect(decided).rejects.toMatchObject({ code: "llm.provider_balance_exhausted", retryable: false, status: 402 });
  });
});

async function refusedWith(status: number, payload: unknown): Promise<AutomationStudioLlmProviderError> {
  const provider = createAutomationStudioDeepSeekProvider({
    secretReference: { kind: "secret_reference", id: "secret:deepseek" },
    resolveSecret: async () => SECRET,
    fetchImpl: (async () => new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } })) as typeof fetch
  });
  try {
    await provider.runTask(request());
  } catch (error) {
    return error as AutomationStudioLlmProviderError;
  }
  throw new Error("Expected the provider request to be refused.");
}

function request(): AutomationStudioLlmTaskRequest {
  return {
    requestId: "request.balance",
    idempotencyKey: "idempotency.balance",
    timeoutMs: 20_000,
    estimatedInputTokens: 100,
    taskKind: "runtime_diagnosis",
    promptVersion: "automation-studio.runtime-diagnosis.v1",
    expectedOutput: "diagnosis",
    tokenLimits: { maxInputTokens: 8000, maxOutputTokens: 2000, maxTotalTokens: 10_000 },
    maxEstimatedCostUsd: 0.25,
    context: {
      schemaVersion: "0.1",
      taskKind: "runtime_diagnosis",
      promptVersion: "automation-studio.runtime-diagnosis.v1",
      projectId: "project.one",
      flowId: "flow.one",
      instructions: {
        instructions: [{ instructionId: "instruction.one", scopeKind: "flow", title: "What to do", body: "Find the cheapest item.", priority: 1, requirement: "required", tags: [] }],
        instructionIds: ["instruction.one"],
        diagnostics: [],
        tokenBudget: 8000,
        estimatedTokens: 12
      }
    }
  };
}
