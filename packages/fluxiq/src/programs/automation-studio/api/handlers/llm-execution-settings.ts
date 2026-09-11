// Flow metadata may pin live LLM execution. Reject anything but the supported
// provider and model, and hold every limit inside its bound.

import { AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_CALLS } from "../../runtime/index.ts";
import { boundedWholeNumber } from "./bounded-whole-number.ts";

export function assertFlowLlmExecutionSettings(metadata: Record<string, unknown>): void {
  if (metadata.llmProvider !== undefined && metadata.llmProvider !== "deepseek") throw new Error("Only DeepSeek is supported for live LLM execution.");
  if (metadata.llmModel !== undefined && metadata.llmModel !== "deepseek-chat") throw new Error("Only deepseek-chat is supported for live LLM execution.");
  if (metadata.llmExecutionSettings === undefined) return;
  const execution = metadata.llmExecutionSettings;
  if (!execution || typeof execution !== "object" || Array.isArray(execution)) throw new Error("LLM execution settings are invalid.");
  const value = execution as Record<string, unknown>;
  const tokens = value.tokenLimits;
  if (!tokens || typeof tokens !== "object" || Array.isArray(tokens)) throw new Error("LLM token limits are invalid.");
  const tokenLimits = tokens as Record<string, unknown>;
  const maxInputTokens = boundedWholeNumber(tokenLimits.maxInputTokens, 1, 50_000);
  const maxOutputTokens = boundedWholeNumber(tokenLimits.maxOutputTokens, 1, 50_000);
  const maxTotalTokens = boundedWholeNumber(tokenLimits.maxTotalTokens, 1, 50_000);
  if (maxInputTokens + maxOutputTokens > maxTotalTokens) throw new Error("LLM input and output limits exceed the total-token limit.");
  boundedWholeNumber(value.maxCalls, 1, AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_CALLS);
  boundedWholeNumber(value.timeoutMs, 1, 25_000);
  if (typeof value.maxEstimatedCostUsd !== "number" || !Number.isFinite(value.maxEstimatedCostUsd) || value.maxEstimatedCostUsd <= 0 || value.maxEstimatedCostUsd > 0.25) throw new Error("LLM estimated-cost limit is invalid.");
  if (value.retryCount !== 0) throw new Error("Flow LLM execution does not permit provider retries.");
}
