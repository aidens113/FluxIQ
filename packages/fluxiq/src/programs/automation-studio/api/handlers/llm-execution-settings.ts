// Flow metadata may pin live LLM execution. Reject anything but the supported
// provider and model, and hold every limit inside its bound.

import { AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_CALLS, automationStudioDeepSeekModelRefusal, isAutomationStudioDeepSeekModel } from "../../runtime/index.ts";
import { boundedWholeNumber } from "./bounded-whole-number.ts";

export function assertFlowLlmExecutionSettings(metadata: Record<string, unknown>): void {
  if (metadata.llmProvider !== undefined && metadata.llmProvider !== "deepseek") throw new Error("Only DeepSeek is supported for live LLM execution.");
  if (metadata.llmModel !== undefined && !isAutomationStudioDeepSeekModel(metadata.llmModel)) throw new Error(automationStudioDeepSeekModelRefusal(metadata.llmModel));
  if (metadata.llmExecutionSettings === undefined) return;
  const execution = metadata.llmExecutionSettings;
  if (!execution || typeof execution !== "object" || Array.isArray(execution)) throw new Error("LLM execution settings are invalid.");
  const value = execution as Record<string, unknown>;
  const tokens = value.tokenLimits;
  if (!tokens || typeof tokens !== "object" || Array.isArray(tokens)) throw new Error("LLM token limits are invalid.");
  const tokenLimits = tokens as Record<string, unknown>;
  // 64,000 is Core's own per-request ceiling
  // (`AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST`), which is
  // where it explains itself; it was `deepseek-chat`'s whole context window
  // while that was the only model Core sent to, and the configured models carry
  // far more. These were 50_000, the sixth and last place holding a ceiling that
  // between them made a real page impossible to describe -- see the provider's
  // own limit check and the Lab's budget.
  const maxInputTokens = boundedWholeNumber(tokenLimits.maxInputTokens, 1, 64_000);
  const maxOutputTokens = boundedWholeNumber(tokenLimits.maxOutputTokens, 1, 64_000);
  const maxTotalTokens = boundedWholeNumber(tokenLimits.maxTotalTokens, 1, 64_000);
  if (maxInputTokens + maxOutputTokens > maxTotalTokens) throw new Error("LLM input and output limits exceed the total-token limit.");
  boundedWholeNumber(value.maxCalls, 1, AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_MAX_CALLS);
  boundedWholeNumber(value.timeoutMs, 1, 25_000);
  if (typeof value.maxEstimatedCostUsd !== "number" || !Number.isFinite(value.maxEstimatedCostUsd) || value.maxEstimatedCostUsd <= 0 || value.maxEstimatedCostUsd > 0.25) throw new Error("LLM estimated-cost limit is invalid.");
  if (value.retryCount !== 0) throw new Error("Flow LLM execution does not permit provider retries.");
}
