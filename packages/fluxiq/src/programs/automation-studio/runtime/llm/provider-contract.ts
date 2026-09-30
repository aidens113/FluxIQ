import { parseAutomationStudioLlmProviderRefusal, type AutomationStudioLlmProviderRefusal } from "../provider-refusal/index.ts";
import { automationStudioLlmProviderThrowRead, type AutomationStudioLlmProviderThrowRead } from "./throw-account/index.ts";

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
  // The standardized account of the failure a runtime task carries. It now
  // holds a projection of the Flow's authored parameters and of its graph, so
  // it is an evidence-bearing slot like the rest and is re-checked like them:
  // the domain's keys, no credentials, and nothing shaped like a way to address
  // an element.
  "llm.provider_recovery_context_invalid",
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
    readonly provenance: AutomationStudioLlmProviderFailureProvenance = defaultProviderFailureProvenance(code),
    /**
     * What the provider said, for a caller keeping a local diagnostic.
     *
     * **It is whatever the adapter put here, and by itself it is never
     * published.** It exists because a 400 is a client error — the request was
     * wrong — and the only thing that says *how* is the body the provider sends
     * back with it. Two live runs died on their first call with an unexplained
     * 400 and this was thrown away unread one line after being in hand.
     *
     * An adapter that has screened its answer into a refusal record encodes it
     * here as JSON, which is how Core's DeepSeek adapter carries one today
     * (`deepseek/refusal.ts`). `normalizedAutomationStudioLlmProviderFailure`
     * reads exactly that and nothing else: a string that is not a record
     * satisfying `refusal-record.ts`'s bounds yields no `refusal`, so raw prose
     * left here stays on the throw and reaches no reader. A new adapter should
     * pass `refusal` instead and leave this alone.
     *
     * Bounded by the caller, so a provider answering with a megabyte of HTML
     * cannot be held in memory on the strength of being wrong.
     */
    readonly responseBody?: string,
    /**
     * The same answer, typed: what the provider refused with, screened by the
     * adapter and bounded by `refusal-record.ts`.
     *
     * This is the field a refusal should arrive on. It is provider-neutral on
     * purpose — a refusal is a status, what the provider said about it, the
     * shape of the request it refused, and what was deliberately left out — so
     * no reader downstream has to know which adapter produced it, and no reader
     * has to re-parse a string of unknown shape to find out.
     */
    readonly refusal?: AutomationStudioLlmProviderRefusal
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
  refusal?: AutomationStudioLlmProviderRefusal;
  /**
   * What an untyped throw was, as read (`throw-account/`). Only on
   * `llm.provider_request_failed`: a typed failure already names its fault with
   * a code Core chose, and its message stays on the throw.
   *
   * **Its message is unscreened.** The account beside it is codes only; the
   * message reaches a record only through the harness's screen
   * (`harness/throw-screen.ts`), which is the one caller that publishes it.
   */
  thrown?: AutomationStudioLlmProviderThrowRead;
} {
  const typed = structurallyTypedProviderError(error);
  if (typed) {
    const refusal = refusalFromProviderError(error);
    return {
      code: typed.code,
      message: safeProviderFailureMessage(typed.code),
      retryable: typed.retryable,
      ...(typed.status !== undefined ? { status: typed.status } : {}),
      provenance: error instanceof AutomationStudioLlmProviderError ? error.provenance : defaultProviderFailureProvenance(typed.code),
      ...(refusal ? { refusal } : {})
    };
  }
  // The code says only that something threw. What threw is the one thing that
  // can tell a reset socket from a failed name lookup from a bug in an adapter,
  // and `run-mun5e1ie-5aeefbbd` was stored without it.
  const thrown = automationStudioLlmProviderThrowRead(error);
  return {
    code: "llm.provider_request_failed",
    message: "The LLM provider request failed before a valid response was returned.",
    retryable: false,
    provenance: { providerInvocation: "unknown", providerResponse: "unknown" },
    ...(thrown ? { thrown } : {})
  };
}

/**
 * The refusal an adapter in this process screened, and only that one.
 *
 * Read from a real `AutomationStudioLlmProviderError` and never from a
 * structurally typed clone, for the same reason `provenance` is: a clone comes
 * from outside this module's guarantees — another bundle, a provider's own
 * object, a test double — and its `code`, `retryable` and `status` are read
 * because each is checked against Core's own vocabulary and ranges. A refusal
 * record cannot be checked that way. It carries the provider's sentence, and
 * the one thing that makes that sentence publishable is that the adapter which
 * built the record ran it through Core's credential and locator screens. A
 * clone claiming a record makes the claim without the screen, so the claim is
 * not read.
 */
function refusalFromProviderError(error: unknown): AutomationStudioLlmProviderRefusal | undefined {
  if (!(error instanceof AutomationStudioLlmProviderError)) return undefined;
  return error.refusal ?? parseAutomationStudioLlmProviderRefusal(error.responseBody);
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
