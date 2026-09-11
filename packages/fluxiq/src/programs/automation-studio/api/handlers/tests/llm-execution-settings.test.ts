// Covers handlers/llm-execution-settings.ts.

import { describe, expect, it } from "vitest";

import { assertFlowLlmExecutionSettings } from "../index.ts";

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

  it("accepts bounded one-call diagnosis and two-call diagnose-and-adapt settings", () => {
    expect(() => assertFlowLlmExecutionSettings(valid)).not.toThrow();
    expect(() => assertFlowLlmExecutionSettings({ ...valid, llmExecutionSettings: { ...valid.llmExecutionSettings, maxCalls: 8 } })).not.toThrow();
    expect(() => assertFlowLlmExecutionSettings({ ...valid, llmExecutionSettings: { ...valid.llmExecutionSettings, timeoutMs: 25_000 } })).not.toThrow();
  });

  it("rejects unsupported providers, oversized totals, calls, retries, timeout, and cost", () => {
    expect(() => assertFlowLlmExecutionSettings({ ...valid, llmProvider: "openai" })).toThrow(/DeepSeek/);
    expect(() => assertFlowLlmExecutionSettings({ ...valid, llmExecutionSettings: { ...valid.llmExecutionSettings, tokenLimits: { ...valid.llmExecutionSettings.tokenLimits, maxTotalTokens: 50001 } } })).toThrow(/limit/);
    expect(() => assertFlowLlmExecutionSettings({ ...valid, llmExecutionSettings: { ...valid.llmExecutionSettings, maxCalls: 0 } })).toThrow(/limit/);
    expect(() => assertFlowLlmExecutionSettings({ ...valid, llmExecutionSettings: { ...valid.llmExecutionSettings, maxCalls: 9 } })).toThrow(/limit/);
    expect(() => assertFlowLlmExecutionSettings({ ...valid, llmExecutionSettings: { ...valid.llmExecutionSettings, retryCount: 1 } })).toThrow(/retries/);
    expect(() => assertFlowLlmExecutionSettings({ ...valid, llmExecutionSettings: { ...valid.llmExecutionSettings, timeoutMs: 25001 } })).toThrow(/limit/);
    expect(() => assertFlowLlmExecutionSettings({ ...valid, llmExecutionSettings: { ...valid.llmExecutionSettings, maxEstimatedCostUsd: 0.26 } })).toThrow(/cost/);
  });
});
