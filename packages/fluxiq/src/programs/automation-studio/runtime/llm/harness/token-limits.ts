import type { AutomationStudioLlmDiagnostic } from "./diagnostic.ts";
import type { AutomationStudioLlmUsageSummary } from "./provider.ts";

/**
 * The most a single request may carry: Core's own ceiling, not the model's.
 *
 * It was raised to 64,000 because that was `deepseek-chat`'s whole context
 * window, and while that alias was the only model Core would send to, Core's
 * ceiling and the model's window were the same number. They are not any more.
 * `deepseek-flash` carries 1,000,000 tokens of context and will generate up to
 * 384,000 in one reply (`AUTOMATION_STUDIO_DEEPSEEK_MODEL_LIMITS`), so this
 * number is now a budget decision rather than a physical limit, and it is left
 * where it is deliberately: at the peak cache-miss rate a 64,000-token request
 * costs about $0.019, and a 1,000,000-token one about $0.30 -- before output,
 * and before the run's other calls. Raising it raises what a single mistaken
 * call can spend by the same factor, so it is moved on purpose or not at all.
 *
 * This was 50_000 and is the deepest of the seven places that held a ceiling of
 * this kind -- the Lab's default budget and contract cap, the Lab plan's bound,
 * the campaign's own arguments, this program's grant default, the API handler's
 * settings bound, and the provider's final check. Every one of them had to move
 * together: raising any single one was silently clamped by the next, which is
 * why the first attempt at this changed nothing observable.
 */
export const AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST = 64_000;
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
