/**
 * Every way a provider refuses a request before sending it, one code per check.
 *
 * These were all `llm.provider_configuration_invalid`, and a run records codes,
 * never messages, so a refusal said only that *something* local was wrong. That
 * hid a stale field list in the DeepSeek adapter through every live recovery:
 * each one made a call that was refused before it left the process, and the
 * record could not say which check had refused it. A code names the check; the
 * message stays out of the record.
 */
export const AUTOMATION_STUDIO_LLM_PROVIDER_PREFLIGHT_ERROR_CODES = Object.freeze([
  // The provider as configured.
  "llm.provider_secret_reference_invalid",
  "llm.provider_model_unsupported",
  "llm.provider_response_limit_invalid",
  // The request as built.
  "llm.provider_request_identity_invalid",
  "llm.provider_request_scope_invalid",
  "llm.provider_request_context_unbounded",
  "llm.provider_request_task_mismatch",
  "llm.provider_recent_actions_invalid",
  "llm.provider_failure_evidence_invalid",
  // The explored packets a runtime patch carries, re-checked like failure
  // evidence: the packet builder's rule, the domain's keys, no credentials.
  "llm.provider_exploration_evidence_invalid",
  // The bounded result summary a verification carries, re-checked the same way:
  // its own rule, the domain's keys, no credentials.
  "llm.provider_result_summary_invalid",
  "llm.provider_flow_bootstrap_context_invalid",
  "llm.provider_evidence_loop_context_invalid",
  "llm.provider_request_limits_invalid",
  "llm.provider_request_timeout_invalid",
  "llm.provider_input_budget_exceeded",
  "llm.provider_credential_in_request",
  // Something threw that no named check caught: while the request was being
  // built, or anywhere else before it could be sent.
  "llm.provider_request_construction_failed",
  "llm.provider_request_setup_failed"
] as const);

export type AutomationStudioLlmProviderPreflightErrorCode = (typeof AUTOMATION_STUDIO_LLM_PROVIDER_PREFLIGHT_ERROR_CODES)[number];

/**
 * Every way a provider call fails once it is under way: resolving the
 * credential, the transport, and the reply. Listed as values, beside the
 * pre-flight list, so a table keyed by every code can be checked against the
 * whole vocabulary at run time as well as by the type.
 */
export const AUTOMATION_STUDIO_LLM_PROVIDER_CALL_ERROR_CODES = Object.freeze([
  "llm.provider_auth_failed",
  "llm.provider_rate_limited",
  "llm.provider_timeout",
  "llm.provider_aborted",
  "llm.provider_redirect_rejected",
  "llm.provider_response_oversize",
  "llm.provider_output_padding_truncated",
  "llm.provider_output_truncated",
  "llm.provider_malformed_response",
  "llm.provider_output_invalid",
  "llm.provider_usage_invalid",
  "llm.provider_usage_limit_exceeded",
  "llm.provider_http_error",
  "llm.provider_network_error",
  "llm.provider_secret_unavailable"
] as const);

export type AutomationStudioLlmProviderErrorCode =
  | AutomationStudioLlmProviderPreflightErrorCode
  | (typeof AUTOMATION_STUDIO_LLM_PROVIDER_CALL_ERROR_CODES)[number];

const AUTOMATION_STUDIO_LLM_PROVIDER_ERROR_CODES: ReadonlySet<string> = new Set<AutomationStudioLlmProviderErrorCode>([
  ...AUTOMATION_STUDIO_LLM_PROVIDER_CALL_ERROR_CODES,
  ...AUTOMATION_STUDIO_LLM_PROVIDER_PREFLIGHT_ERROR_CODES
]);
const AUTOMATION_STUDIO_LLM_PROVIDER_PREFLIGHT_ERROR_CODE_SET: ReadonlySet<string> = new Set(AUTOMATION_STUDIO_LLM_PROVIDER_PREFLIGHT_ERROR_CODES);

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
      return { providerInvocation: "not_attempted", providerResponse: "not_received" };
    case "llm.provider_timeout":
    case "llm.provider_aborted":
      return { providerInvocation: "unknown", providerResponse: "not_received" };
    default: {
      // Only a pre-flight refusal is left. A new code that is neither fails
      // this assignment rather than silently inheriting "not attempted".
      const refusal: AutomationStudioLlmProviderPreflightErrorCode = code;
      void refusal;
      return { providerInvocation: "not_attempted", providerResponse: "not_received" };
    }
  }
}
function safeProviderFailureMessage(code: AutomationStudioLlmProviderErrorCode): string {
  // One sentence for every pre-flight refusal: the code already names the
  // check, and the check's own wording stays out of anything recorded.
  if (AUTOMATION_STUDIO_LLM_PROVIDER_PREFLIGHT_ERROR_CODE_SET.has(code)) return "The LLM provider refused the request before sending it.";
  const messages: Record<Exclude<AutomationStudioLlmProviderErrorCode, AutomationStudioLlmProviderPreflightErrorCode>, string> = {
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
    "llm.provider_secret_unavailable": "The LLM provider credential is unavailable."
  };
  return messages[code as Exclude<AutomationStudioLlmProviderErrorCode, AutomationStudioLlmProviderPreflightErrorCode>];
}
