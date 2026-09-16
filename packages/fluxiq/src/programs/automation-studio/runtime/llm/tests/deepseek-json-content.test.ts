import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmTaskRequest } from "../harness.ts";
import { createAutomationStudioDeepSeekProvider } from "../deepseek-provider.ts";
import { AutomationStudioLlmProviderError } from "../provider-contract.ts";

// Live DeepSeek, in JSON mode at temperature 0, returned one complete object and
// then a single surplus `}` on every call of a run. The whole-string parse failed
// at the last character, the reply counted as malformed, and the exploration
// ended after one call. These pin that exactly that shape is repaired and
// nothing looser is.

const DIAGNOSIS = JSON.stringify({ kind: "diagnosis", summary: "A bounded diagnosis with a brace } and a quote \" inside.", confidence: 0.9 });

describe("DeepSeek reply content", () => {
  it("accepts a complete object followed only by stray closing brackets and whitespace", async () => {
    for (const content of [`${DIAGNOSIS}}`, `${DIAGNOSIS}}}`, `${DIAGNOSIS} }\n`, `${DIAGNOSIS}]`, `  ${DIAGNOSIS}}`]) {
      const result = await run(content) as { response: { kind: string; summary: string } };
      expect(result.response.kind, content).toBe("diagnosis");
      // A brace and a quote inside a string did not end the object early.
      expect(result.response.summary).toBe('A bounded diagnosis with a brace } and a quote " inside.');
    }
  });

  it("still refuses trailing text, a second value, or an object that does not parse", async () => {
    for (const content of [`${DIAGNOSIS}x`, `${DIAGNOSIS}{}`, `${DIAGNOSIS},{}`, `${DIAGNOSIS}}"`, `{"kind":"diagnosis",}}`, `[${DIAGNOSIS}]}`, "}", ""]) {
      await expect(run(content), content).rejects.toMatchObject({ code: "llm.provider_malformed_response" });
    }
  });

  it("validates a repaired reply like any other, so a wrong shape is still refused", async () => {
    const wrong = `${JSON.stringify({ kind: "not-a-diagnosis" })}}`;
    const error = await run(wrong).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AutomationStudioLlmProviderError);
    expect((error as AutomationStudioLlmProviderError).code).not.toBe("llm.provider_malformed_response");
  });
});

function run(content: string): Promise<unknown> {
  const provider = createAutomationStudioDeepSeekProvider({
    secretReference: { kind: "secret_reference", id: "secret:deepseek" },
    resolveSecret: async () => "test-secret",
    fetchImpl: (async () => new Response(JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content } }],
      usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 }
    }), { status: 200, headers: { "content-type": "application/json; charset=utf-8" } })) as typeof fetch
  });
  return provider.runTask(request());
}

function request(): AutomationStudioLlmTaskRequest {
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
    }
  };
}
