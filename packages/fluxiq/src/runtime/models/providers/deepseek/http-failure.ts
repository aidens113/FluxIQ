import { AutomationStudioLlmProviderError } from "../../failures/index.ts";
import { isRecord, automationStudioProviderBalanceExhausted as automationStudioDeepSeekBalanceExhausted } from "../../transport/index.ts";

export function automationStudioDeepSeekHttpFailure(status: number, envelope: { value: unknown } | { notJson: unknown }): AutomationStudioLlmProviderError {
  // An empty account first, under any status: DeepSeek's 402, or an error whose own words say so (`./balance-exhausted.ts`).
  const error = "value" in envelope && isRecord(envelope.value) && isRecord(envelope.value.error) ? envelope.value.error : undefined;
  if (automationStudioDeepSeekBalanceExhausted(status, error)) return new AutomationStudioLlmProviderError("llm.provider_balance_exhausted", `DeepSeek refused the call: the account's balance is exhausted (${status}).`, false, status);
  if (status === 401 || status === 403) return new AutomationStudioLlmProviderError("llm.provider_auth_failed", `DeepSeek refused the key (${status}).`, false, status);
  if (status === 429) return new AutomationStudioLlmProviderError("llm.provider_rate_limited", "DeepSeek is rate limiting.", true, status);
  return new AutomationStudioLlmProviderError("llm.provider_http_error", `DeepSeek answered ${status}.`, status >= 500, status);
}
