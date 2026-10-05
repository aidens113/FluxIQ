// Flow metadata may pin live LLM execution. Reject anything but the supported
// provider and model, and hold every limit inside its bound.

import { AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_MAX_USD } from "../../model/index.ts";
import { AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST, automationStudioDeepSeekModelRefusal, isAutomationStudioDeepSeekModel } from "../../runtime/index.ts";
import { boundedWholeNumber } from "./bounded-whole-number.ts";

// The most provider calls a Flow may pin. The run's own budget, and the Flow's
// `adaptationPolicySettings.maxEstimatedCostUsdPerRun`, are what actually bound
// spend.
const FLOW_LLM_EXECUTION_MAX_CALLS = 64;

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
  // The bound is the model's context window
  // (`AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST`, derived from
  // the model limits), which is where it explains itself. It was Core's own
  // 64,000-token ceiling, and 50,000 before that.
  const window = AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST;
  const maxInputTokens = boundedWholeNumber(tokenLimits.maxInputTokens, 1, window);
  const maxOutputTokens = boundedWholeNumber(tokenLimits.maxOutputTokens, 1, window);
  const maxTotalTokens = boundedWholeNumber(tokenLimits.maxTotalTokens, 1, window);
  if (maxInputTokens + maxOutputTokens > maxTotalTokens) throw new Error("LLM input and output limits exceed the total-token limit.");
  boundedWholeNumber(value.maxCalls, 1, FLOW_LLM_EXECUTION_MAX_CALLS);
  boundedWholeNumber(value.timeoutMs, 1, 25_000);
  // The bound is the largest run cost ceiling Core may be configured with
  // (`AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_MAX_USD`), the same bound the Lab
  // plans against. It was a literal $0.25 from before the ceiling became
  // configurable, which refused a Flow built under a $0.30 ceiling only after
  // the build had been paid for (run-musq0b1m-0472cfa0).
  if (typeof value.maxEstimatedCostUsd !== "number" || !Number.isFinite(value.maxEstimatedCostUsd) || value.maxEstimatedCostUsd <= 0 || value.maxEstimatedCostUsd > AUTOMATION_STUDIO_LLM_RUN_COST_CEILING_MAX_USD) throw new Error("LLM estimated-cost limit is invalid.");
  if (value.retryCount !== 0) throw new Error("Flow LLM execution does not permit provider retries.");
}
