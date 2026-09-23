// Covers handlers/llm-execution-settings.ts.

import { describe, expect, it } from "vitest";

import { AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_CALLS } from "../../../runtime/index.ts";
import { assertFlowLlmExecutionSettings } from "../index.ts";

describe("Flow LLM execution settings API validation", () => {
  const valid = {
    llmProvider: "deepseek",
    llmModel: "deepseek-flash",
    llmExecutionSettings: {
      tokenLimits: { maxInputTokens: 8000, maxOutputTokens: 2000, maxTotalTokens: 10000 },
      maxCalls: 1,
      timeoutMs: 20000,
      maxEstimatedCostUsd: 0.25,
      retryCount: 0
    }
  };

  it("accepts bounded call counts up to the one runaway backstop, not a per-mode cap", () => {
    expect(() => assertFlowLlmExecutionSettings(valid)).not.toThrow();
    expect(() => assertFlowLlmExecutionSettings({ ...valid, llmExecutionSettings: { ...valid.llmExecutionSettings, maxCalls: 8 } })).not.toThrow();
    // An iterating recovery needs more than the eight calls the old ceiling allowed.
    expect(() => assertFlowLlmExecutionSettings({ ...valid, llmExecutionSettings: { ...valid.llmExecutionSettings, maxCalls: 9 } })).not.toThrow();
    expect(() => assertFlowLlmExecutionSettings({ ...valid, llmExecutionSettings: { ...valid.llmExecutionSettings, maxCalls: AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_CALLS } })).not.toThrow();
    expect(() => assertFlowLlmExecutionSettings({ ...valid, llmExecutionSettings: { ...valid.llmExecutionSettings, timeoutMs: 25_000 } })).not.toThrow();
  });

  it("rejects unsupported providers, oversized totals, calls, retries, timeout, and cost", () => {
    expect(() => assertFlowLlmExecutionSettings({ ...valid, llmProvider: "openai" })).toThrow(/DeepSeek/);
    expect(() => assertFlowLlmExecutionSettings({ ...valid, llmExecutionSettings: { ...valid.llmExecutionSettings, tokenLimits: { ...valid.llmExecutionSettings.tokenLimits, maxTotalTokens: 64001 } } })).toThrow(/limit/);
    expect(() => assertFlowLlmExecutionSettings({ ...valid, llmExecutionSettings: { ...valid.llmExecutionSettings, maxCalls: 0 } })).toThrow(/limit/);
    expect(() => assertFlowLlmExecutionSettings({ ...valid, llmExecutionSettings: { ...valid.llmExecutionSettings, maxCalls: AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_CALLS + 1 } })).toThrow(/limit/);
    expect(() => assertFlowLlmExecutionSettings({ ...valid, llmExecutionSettings: { ...valid.llmExecutionSettings, retryCount: 1 } })).toThrow(/retries/);
    expect(() => assertFlowLlmExecutionSettings({ ...valid, llmExecutionSettings: { ...valid.llmExecutionSettings, timeoutMs: 25001 } })).toThrow(/limit/);
    expect(() => assertFlowLlmExecutionSettings({ ...valid, llmExecutionSettings: { ...valid.llmExecutionSettings, maxEstimatedCostUsd: 0.26 } })).toThrow(/cost/);
  });
});
