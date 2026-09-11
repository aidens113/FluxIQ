import type { AutomationStudioLlmDiagnostic } from "./diagnostic.ts";
import type { AutomationStudioLlmUsageSummary } from "./provider.ts";

export const AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST = 50_000;
export const AUTOMATION_STUDIO_LLM_DEFAULT_MAX_ESTIMATED_COST_USD = 0.25;
export const AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_ESTIMATED_COST_USD = 10;

export type AutomationStudioLlmTokenLimits = {
  maxInputTokens: number;
  maxOutputTokens: number;
  maxTotalTokens: number;
};

const DEFAULT_AUTOMATION_STUDIO_LLM_TOKEN_LIMITS: AutomationStudioLlmTokenLimits = {
  maxInputTokens: 8_000,
  maxOutputTokens: 2_000,
  maxTotalTokens: 10_000
};

export function resolveAutomationStudioLlmTokenLimits(input?: Partial<AutomationStudioLlmTokenLimits>): {
  limits: AutomationStudioLlmTokenLimits;
  diagnostics: AutomationStudioLlmDiagnostic[];
} {
  const diagnostics: AutomationStudioLlmDiagnostic[] = [];
  const value = (key: keyof AutomationStudioLlmTokenLimits): number => {
    const requested = input?.[key];
    if (requested === undefined) return DEFAULT_AUTOMATION_STUDIO_LLM_TOKEN_LIMITS[key];
    if (!Number.isFinite(requested) || !Number.isInteger(requested) || requested <= 0) {
      diagnostics.push({ severity: "error", code: "llm_budget.invalid_token_limit", message: `${key} must be a positive integer.`, path: `tokenLimits.${key}` });
      return DEFAULT_AUTOMATION_STUDIO_LLM_TOKEN_LIMITS[key];
    }
    if (requested > AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST) {
      diagnostics.push({
        severity: "error",
        code: "llm_budget.absolute_token_ceiling",
        message: `${key} cannot exceed the absolute ${AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST}-token per-request ceiling.`,
        path: `tokenLimits.${key}`
      });
      return AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST;
    }
    return requested;
  };
  const limits = {
    maxInputTokens: value("maxInputTokens"),
    maxOutputTokens: value("maxOutputTokens"),
    maxTotalTokens: value("maxTotalTokens")
  };
  if (limits.maxInputTokens > limits.maxTotalTokens) diagnostics.push({ severity: "error", code: "llm_budget.input_exceeds_total", message: "maxInputTokens cannot exceed maxTotalTokens.", path: "tokenLimits.maxInputTokens" });
  if (limits.maxOutputTokens > limits.maxTotalTokens) diagnostics.push({ severity: "error", code: "llm_budget.output_exceeds_total", message: "maxOutputTokens cannot exceed maxTotalTokens.", path: "tokenLimits.maxOutputTokens" });
  return { limits, diagnostics };
}

export function validateAutomationStudioLlmUsage(usage: AutomationStudioLlmUsageSummary | undefined, limits: AutomationStudioLlmTokenLimits): AutomationStudioLlmDiagnostic[] {
  if (!usage) return [];
  const diagnostics: AutomationStudioLlmDiagnostic[] = [];
  if ((usage.inputTokens ?? 0) > limits.maxInputTokens) diagnostics.push({ severity: "error", code: "llm_usage.input_limit_exceeded", message: "Provider-reported input usage exceeded the request limit." });
  if ((usage.outputTokens ?? 0) > limits.maxOutputTokens) diagnostics.push({ severity: "error", code: "llm_usage.output_limit_exceeded", message: "Provider-reported output usage exceeded the request limit." });
  const total = usage.totalTokens ?? ((usage.inputTokens !== undefined && usage.outputTokens !== undefined) ? usage.inputTokens + usage.outputTokens : undefined);
  if (total !== undefined && total > limits.maxTotalTokens) diagnostics.push({ severity: "error", code: "llm_usage.total_limit_exceeded", message: "Provider-reported total usage exceeded the request limit." });
  return diagnostics;
}

export function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}
