export type AutomationStudioLlmProviderErrorCode =
  | "llm.provider_auth_failed"
  | "llm.provider_rate_limited"
  | "llm.provider_timeout"
  | "llm.provider_aborted"
  | "llm.provider_redirect_rejected"
  | "llm.provider_response_oversize"
  | "llm.provider_malformed_response"
  | "llm.provider_usage_invalid"
  | "llm.provider_http_error"
  | "llm.provider_network_error"
  | "llm.provider_secret_unavailable"
  | "llm.provider_configuration_invalid";

export type AutomationStudioLlmProviderInvocationState = "not_attempted" | "attempted" | "unknown";
export type AutomationStudioLlmProviderResponseState = "not_received" | "received" | "unknown";
export type AutomationStudioLlmProviderFailureProvenance = {
  providerInvocation: AutomationStudioLlmProviderInvocationState;
  providerResponse: AutomationStudioLlmProviderResponseState;
};

export const AUTOMATION_STUDIO_LLM_DEFAULT_TIMEOUT_MS = 20_000;
export const AUTOMATION_STUDIO_LLM_MAX_TIMEOUT_MS = 25_000;

export class AutomationStudioLlmProviderError extends Error {
  readonly name = "AutomationStudioLlmProviderError";

  constructor(
    readonly code: AutomationStudioLlmProviderErrorCode,
    message: string,
    readonly retryable = false,
    readonly status?: number,
    readonly provenance: AutomationStudioLlmProviderFailureProvenance = defaultProviderFailureProvenance(code)
  ) {
    super(message);
  }
}

export type AutomationStudioLlmOpaqueSecretResolver = (input: {
  provider: string;
  secretReference: string;
  projectId: string;
  flowId: string;
  requestId: string;
  purpose: "llm_provider_request";
  outboundBody: string;
  signal: AbortSignal;
}) => Promise<string>;

export function normalizedAutomationStudioLlmProviderFailure(error: unknown): {
  code: AutomationStudioLlmProviderErrorCode | "llm.provider_request_failed";
  message: string;
  retryable: boolean;
  status?: number;
  provenance: AutomationStudioLlmProviderFailureProvenance;
} {
  if (error instanceof AutomationStudioLlmProviderError) {
    return {
      code: error.code,
      message: safeProviderFailureMessage(error.code),
      retryable: error.retryable,
      ...(error.status !== undefined ? { status: error.status } : {}),
      provenance: error.provenance
    };
  }
  return {
    code: "llm.provider_request_failed",
    message: "The LLM provider request failed before a valid response was returned.",
    retryable: false,
    provenance: { providerInvocation: "unknown", providerResponse: "unknown" }
  };
}

function defaultProviderFailureProvenance(code: AutomationStudioLlmProviderErrorCode): AutomationStudioLlmProviderFailureProvenance {
  switch (code) {
    case "llm.provider_auth_failed":
    case "llm.provider_rate_limited":
    case "llm.provider_redirect_rejected":
    case "llm.provider_response_oversize":
    case "llm.provider_malformed_response":
    case "llm.provider_usage_invalid":
    case "llm.provider_http_error":
      return { providerInvocation: "attempted", providerResponse: "received" };
    case "llm.provider_network_error":
      return { providerInvocation: "attempted", providerResponse: "unknown" };
    case "llm.provider_secret_unavailable":
    case "llm.provider_configuration_invalid":
      return { providerInvocation: "not_attempted", providerResponse: "not_received" };
    case "llm.provider_timeout":
    case "llm.provider_aborted":
      return { providerInvocation: "unknown", providerResponse: "not_received" };
  }
}
function safeProviderFailureMessage(code: AutomationStudioLlmProviderErrorCode): string {
  const messages: Record<AutomationStudioLlmProviderErrorCode, string> = {
    "llm.provider_auth_failed": "The LLM provider rejected the configured credential.",
    "llm.provider_rate_limited": "The LLM provider rate limited the request.",
    "llm.provider_timeout": "The LLM provider request timed out.",
    "llm.provider_aborted": "The LLM provider request was cancelled.",
    "llm.provider_redirect_rejected": "The LLM provider attempted a forbidden redirect.",
    "llm.provider_response_oversize": "The LLM provider response exceeded its byte limit.",
    "llm.provider_malformed_response": "The LLM provider returned a malformed response.",
    "llm.provider_usage_invalid": "The LLM provider returned invalid usage.",
    "llm.provider_http_error": "The LLM provider returned an unsuccessful HTTP status.",
    "llm.provider_network_error": "The LLM provider request failed at the network boundary.",
    "llm.provider_secret_unavailable": "The LLM provider credential is unavailable.",
    "llm.provider_configuration_invalid": "The LLM provider configuration is invalid."
  };
  return messages[code];
}
