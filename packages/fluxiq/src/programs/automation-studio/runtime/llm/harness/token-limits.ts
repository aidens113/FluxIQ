// Read at module evaluation, so from the leaf that imports no value: through
// the deepseek barrel this module would re-enter the harness part-built by way
// of the provider's pre-flight, and the constant would arrive undefined.
import { AUTOMATION_STUDIO_DEEPSEEK_MAX_CONTEXT_TOKENS } from "../model-limits/index.ts";
import type { AutomationStudioLlmDiagnostic } from "./diagnostic.ts";
import type { AutomationStudioLlmUsageSummary } from "./provider.ts";

/**
 * The most a single request may carry: the model's context window.
 *
 * Derived, never restated: the largest `contextTokens` in
 * `AUTOMATION_STUDIO_DEEPSEEK_MODEL_LIMITS` (1,000,000 for both models today).
 * It was Core's own ceiling of 64,000 (and 50,000 before that), set as a
 * budget decision; with whole-page evidence that ceiling hid the page from the
 * model, and the standing decision of 2026-09-30 is that the only limit on a
 * request is the model's window. A request over it is refused before it is
 * sent, with its measured size (`./run.ts`, `../deepseek/provider.ts`), and is
 * never trimmed to fit.
 *
 * Spend is not bounded here. The run's $0.25 cost ceiling and the per-call
 * cost check derived from it (`../flow-execution-limits/`) are what stop a
 * build spending, and they are unchanged.
 *
 * Every other per-request ceiling reads this: the API handler's Flow-settings
 * bound, the provider's pre-flight, the session-key profile and the web app's
 * Flow settings form.
 */
export const AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST: number = AUTOMATION_STUDIO_DEEPSEEK_MAX_CONTEXT_TOKENS;
export const AUTOMATION_STUDIO_LLM_DEFAULT_MAX_ESTIMATED_COST_USD = 0.25;
export const AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_ESTIMATED_COST_USD = 10;

export type AutomationStudioLlmTokenLimits = {
  maxInputTokens: number;
  maxOutputTokens: number;
  maxTotalTokens: number;
};

/**
 * What one call reserves for the model's reply when its caller names no output
 * limit: 8,000 tokens, the reply reserve the live session-key profile has used
 * since the window became the request bound (`../session-key-provider.ts`).
 */
export const AUTOMATION_STUDIO_LLM_DEFAULT_REPLY_TOKENS = 8_000;

/**
 * What a build's decision call reserves for its reply: 2,000 tokens.
 *
 * Derived from what decisions actually reply with: at least three times the
 * largest of 6,119 recorded build-decision replies across 1,222 runs (593
 * tokens, an `amend_draft`; p99 469, median 101; none truncated), rounded up
 * to the thousand. The corpus is
 * `docs/working/language-driven-flow-loop-plan/reports/t234-reply-sizes.md` in
 * the extension repository.
 *
 * It matters because a build's purse holds each call at its worst case before
 * it is sent (`../build-purse/`): every input token uncached and the whole
 * reply allowance. At the default 8,000 the reply alone was held at more than
 * thirteen times what any decision has used, and a build stopped with money it
 * could still have spent. The hold stays a true upper bound because the
 * request's `max_tokens` is this same figure: the provider cannot reply past
 * it.
 *
 * Only the build loop's decision call takes it (`../../service.ts`). Runtime
 * patch steps may serialize to about 2,700 tokens, so the default reply
 * allowance, patch steps, recovery and the instruction reading are unchanged.
 */
export const AUTOMATION_STUDIO_LLM_DECISION_REPLY_TOKENS = 2_000;

/**
 * A build decision's token limits: the resolver's input and total, with the
 * reply allowance at most `AUTOMATION_STUDIO_LLM_DECISION_REPLY_TOKENS`.
 *
 * A decision's reply allowance is what decisions use, so the purse holds it at
 * a true worst case; input and total are the resolver's. Limits the resolver
 * named badly are passed through as named, so the harness refuses them with
 * its own diagnostics rather than this narrowing hiding them.
 */
export function automationStudioLlmDecisionTokenLimits(named: Partial<AutomationStudioLlmTokenLimits> | undefined): Partial<AutomationStudioLlmTokenLimits> | undefined {
  const resolved = resolveAutomationStudioLlmTokenLimits(named);
  return resolved.diagnostics.length ? named : { ...resolved.limits, maxOutputTokens: Math.min(resolved.limits.maxOutputTokens, AUTOMATION_STUDIO_LLM_DECISION_REPLY_TOKENS) };
}

/**
 * One call's limits when the caller names none: the model's context window,
 * with the reply reserve taken out of it for the reply and the rest the
 * input's.
 *
 * Until 2026-09-30 these were 8,000 input, 2,000 output and 10,000 total tokens,
 * so a call through a resolver that named no limits was refused at 8,000 input
 * tokens -- far below a whole page. The user's order that day leaves the window
 * as the only bound on a request, so the defaults are the window: 992,000 input,
 * 8,000 output and 1,000,000 total for DeepSeek today. A limit a caller names
 * still binds, and the missing ones are derived from it: an output limit with
 * no input limit leaves the input the window less that output, and a total
 * limit with neither leaves the input the total less the reply reserve.
 */
export const AUTOMATION_STUDIO_LLM_DEFAULT_TOKEN_LIMITS: AutomationStudioLlmTokenLimits = Object.freeze({
  maxInputTokens: AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST - AUTOMATION_STUDIO_LLM_DEFAULT_REPLY_TOKENS,
  maxOutputTokens: AUTOMATION_STUDIO_LLM_DEFAULT_REPLY_TOKENS,
  maxTotalTokens: AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST
});

export function resolveAutomationStudioLlmTokenLimits(input?: Partial<AutomationStudioLlmTokenLimits>): {
  limits: AutomationStudioLlmTokenLimits;
  diagnostics: AutomationStudioLlmDiagnostic[];
} {
  const diagnostics: AutomationStudioLlmDiagnostic[] = [];
  const value = (key: keyof AutomationStudioLlmTokenLimits, fallback: number): number => {
    const requested = input?.[key];
    if (requested === undefined) return fallback;
    if (!Number.isFinite(requested) || !Number.isInteger(requested) || requested <= 0) {
      diagnostics.push({ severity: "error", code: "llm_budget.invalid_token_limit", message: `${key} must be a positive integer.`, path: `tokenLimits.${key}` });
      return fallback;
    }
    if (requested > AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST) {
      diagnostics.push({
        severity: "error",
        code: "llm_budget.absolute_token_ceiling",
        message: `${key} cannot exceed the model's ${AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST}-token context window.`,
        path: `tokenLimits.${key}`
      });
      return AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_TOTAL_TOKENS_PER_REQUEST;
    }
    return requested;
  };
  // A limit the caller left out is derived from the ones it named, so naming
  // one never leaves the others contradicting it (`AUTOMATION_STUDIO_LLM_DEFAULT_TOKEN_LIMITS`).
  const maxTotalTokens = value("maxTotalTokens", AUTOMATION_STUDIO_LLM_DEFAULT_TOKEN_LIMITS.maxTotalTokens);
  const maxOutputTokens = value("maxOutputTokens", Math.min(AUTOMATION_STUDIO_LLM_DEFAULT_REPLY_TOKENS, maxTotalTokens));
  const maxInputTokens = value("maxInputTokens", Math.max(1, maxTotalTokens - maxOutputTokens));
  const limits = { maxInputTokens, maxOutputTokens, maxTotalTokens };
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
