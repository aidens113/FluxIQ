export type AutomationStudioLlmProviderErrorCode =
  | "llm.provider_auth_failed"
  | "llm.provider_rate_limited"
  | "llm.provider_timeout"
  | "llm.provider_aborted"
  | "llm.provider_redirect_rejected"
  | "llm.provider_response_oversize"
  | "llm.provider_output_padding_truncated"
  | "llm.provider_output_truncated"
  | "llm.provider_malformed_response"
  | "llm.provider_output_invalid"
  | "llm.provider_usage_invalid"
  | "llm.provider_usage_limit_exceeded"
  | "llm.provider_http_error"
  | "llm.provider_network_error"
  | "llm.provider_secret_unavailable"
  | "llm.provider_configuration_invalid";

const AUTOMATION_STUDIO_LLM_PROVIDER_ERROR_CODES: ReadonlySet<string> = new Set<AutomationStudioLlmProviderErrorCode>([
  "llm.provider_auth_failed", "llm.provider_rate_limited", "llm.provider_timeout", "llm.provider_aborted",
  "llm.provider_redirect_rejected", "llm.provider_response_oversize", "llm.provider_output_padding_truncated",
  "llm.provider_output_truncated", "llm.provider_malformed_response", "llm.provider_output_invalid",
  "llm.provider_usage_invalid", "llm.provider_usage_limit_exceeded", "llm.provider_http_error",
  "llm.provider_network_error", "llm.provider_secret_unavailable", "llm.provider_configuration_invalid"
]);

export type AutomationStudioLlmProviderInvocationState = "not_attempted" | "attempted" | "unknown";
export type AutomationStudioLlmProviderResponseState = "not_received" | "received" | "unknown";
export type AutomationStudioLlmProviderFailureProvenance = {
  providerInvocation: AutomationStudioLlmProviderInvocationState;
  providerResponse: AutomationStudioLlmProviderResponseState;
};

export const AUTOMATION_STUDIO_LLM_DEFAULT_TIMEOUT_MS = 20_000;
export const AUTOMATION_STUDIO_LLM_MAX_TIMEOUT_MS = 45_000;

export function automationStudioLlmSignalTimedOut(signal: AbortSignal | undefined): boolean {
  if (!signal?.aborted || !signal.reason || typeof signal.reason !== "object") return false;
  return (signal.reason as { name?: unknown }).name === "TimeoutError";
}

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
  const typed = structurallyTypedProviderError(error);
  if (typed) {
    return {
      code: typed.code,
      message: safeProviderFailureMessage(typed.code),
      retryable: typed.retryable,
      ...(typed.status !== undefined ? { status: typed.status } : {}),
      provenance: error instanceof AutomationStudioLlmProviderError ? error.provenance : defaultProviderFailureProvenance(typed.code)
    };
  }
  return {
    code: "llm.provider_request_failed",
    message: "The LLM provider request failed before a valid response was returned.",
    retryable: false,
    provenance: { providerInvocation: "unknown", providerResponse: "unknown" }
  };
}

function structurallyTypedProviderError(error: unknown): {
  code: AutomationStudioLlmProviderErrorCode;
  retryable: boolean;
  status?: number;
} | undefined {
  try {
    if (!error || typeof error !== "object") return undefined;
    const candidate = error as { code?: unknown; retryable?: unknown; status?: unknown };
    if (typeof candidate.code !== "string" || !AUTOMATION_STUDIO_LLM_PROVIDER_ERROR_CODES.has(candidate.code)
      || typeof candidate.retryable !== "boolean") return undefined;
    if (candidate.status !== undefined
      && (!Number.isInteger(candidate.status) || (candidate.status as number) < 100 || (candidate.status as number) > 599)) return undefined;
    return {
      code: candidate.code as AutomationStudioLlmProviderErrorCode,
      retryable: candidate.retryable,
      ...(candidate.status !== undefined ? { status: candidate.status as number } : {})
    };
  } catch {
    return undefined;
  }
}

function defaultProviderFailureProvenance(code: AutomationStudioLlmProviderErrorCode): AutomationStudioLlmProviderFailureProvenance {
  switch (code) {
    case "llm.provider_auth_failed":
    case "llm.provider_rate_limited":
    case "llm.provider_redirect_rejected":
    case "llm.provider_response_oversize":
    case "llm.provider_output_padding_truncated":
    case "llm.provider_output_truncated":
    case "llm.provider_malformed_response":
    case "llm.provider_output_invalid":
    case "llm.provider_usage_invalid":
    case "llm.provider_usage_limit_exceeded":
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
    "llm.provider_output_padding_truncated": "The LLM provider reached its output limit without returning substantive content.",
    "llm.provider_output_truncated": "The LLM provider stopped before completing its output.",
    "llm.provider_malformed_response": "The LLM provider returned a malformed response.",
    "llm.provider_output_invalid": "The LLM provider returned output that does not satisfy the requested structure.",
    "llm.provider_usage_invalid": "The LLM provider returned invalid usage.",
    "llm.provider_usage_limit_exceeded": "The LLM provider reported usage above the configured token limits.",
    "llm.provider_http_error": "The LLM provider returned an unsuccessful HTTP status.",
    "llm.provider_network_error": "The LLM provider request failed at the network boundary.",
    "llm.provider_secret_unavailable": "The LLM provider credential is unavailable.",
    "llm.provider_configuration_invalid": "The LLM provider configuration is invalid."
  };
  return messages[code];
}
