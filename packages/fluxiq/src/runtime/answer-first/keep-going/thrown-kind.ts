// What a thrown error says about the money or the model service. Read by the
// error's class and code, never by its message. Anything unknown is "other".

import { AutomationStudioLlmBuildPurseRefused } from "../../llm/build-purse/index.ts";
import { AutomationStudioLlmProviderError, normalizedAutomationStudioLlmProviderFailure } from "../../models/failures/index.ts";

const SILENT_CODES: ReadonlySet<string> = new Set(["llm.provider_timeout", "llm.provider_network_error", "llm.provider_rate_limited"]);

export function automationStudioAnswerFirstThrownKind(error: unknown): "purse" | "empty_balance" | "silent" | "other" {
  if (error instanceof AutomationStudioLlmBuildPurseRefused) return "purse";
  if (!(error instanceof AutomationStudioLlmProviderError)) return "other";
  const failure = normalizedAutomationStudioLlmProviderFailure(error);
  if (failure.code === "llm.provider_balance_exhausted") return "empty_balance";
  if (SILENT_CODES.has(failure.code)) return "silent";
  if (failure.code === "llm.provider_http_error" && typeof failure.status === "number" && failure.status >= 500 && failure.status <= 599) return "silent";
  return "other";
}
