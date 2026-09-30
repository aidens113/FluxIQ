// What a failed provider call means for the run it was made in.
//
// A provider failure says one of two things. Some failures say something no
// retry can fix: the caller's key was rejected or is gone, the request is one
// Core will never send, the call was cancelled, the provider billed past the
// call's ceiling. Asking again would fail the same way, so the model's part in
// the run or loop ends there. Other failures only say something about one
// reply: a model that answers once with a malformed object, or a provider that
// is slow once. The next call may well succeed, so the failure only spends the
// call, and a loop that is meant to iterate asks again.
//
// So each provider failure code is given one of two meanings here, and the
// meaning is decided by the code, never by a message. **`end_model_calls`** is
// a credential or integrity failure: nothing that happens next can make the
// call succeed, so the model is asked nothing more. **`spend_call`** is the
// model or the network: the credential went to the fixed endpoint, and the call
// is counted and charged against the run's budget exactly as a successful one
// would be. **`spend_call_on_server_error`** is an HTTP failure, which is the
// network only when the status is a 5xx; any other status is the provider
// refusing this request, and that ends the model's calls.
//
// **The table is closed.** It is a `Record` over every provider code, checked
// with `satisfies`, so a code added to the provider contract and not given a
// meaning here is a compile error rather than a silent default. And anything
// that is not a typed provider failure at all -- a Secret Keys error, an
// exception nobody named -- has no code, is not in the table, and ends the
// model's calls. Nothing falls into "ask again" by omission.

import {
  AutomationStudioLlmProviderError,
  normalizedAutomationStudioLlmProviderFailure,
  type AutomationStudioLlmProviderErrorCode
} from "./provider-contract.ts";

/** What a failed call does to the rest of the model's calls in the run. */
export type AutomationStudioLlmProviderFailureDisposition = "end_model_calls" | "spend_call" | "spend_call_on_server_error";

const END_MODEL_CALLS = "end_model_calls" as const;

/**
 * Every provider failure code, and what it means for the model's next call.
 *
 * The pre-flight refusals all end the model's calls: a request Core refused to build
 * or send will be refused identically next time, so retrying it only spends
 * reveals, and one of them -- a credential found in the outbound body -- is an
 * exfiltration signal in its own right.
 */
export const AUTOMATION_STUDIO_LLM_PROVIDER_FAILURE_DISPOSITIONS = Object.freeze({
  // Pre-flight: the provider as configured, and the request as built.
  "llm.provider_secret_reference_invalid": END_MODEL_CALLS,
  "llm.provider_model_unsupported": END_MODEL_CALLS,
  "llm.provider_response_limit_invalid": END_MODEL_CALLS,
  "llm.provider_request_identity_invalid": END_MODEL_CALLS,
  "llm.provider_request_scope_invalid": END_MODEL_CALLS,
  "llm.provider_request_context_unbounded": END_MODEL_CALLS,
  "llm.provider_request_task_mismatch": END_MODEL_CALLS,
  "llm.provider_recent_actions_invalid": END_MODEL_CALLS,
  "llm.provider_failure_evidence_invalid": END_MODEL_CALLS,
  "llm.provider_exploration_evidence_invalid": END_MODEL_CALLS,
  "llm.provider_result_summary_invalid": END_MODEL_CALLS,
  "llm.provider_recovery_context_invalid": END_MODEL_CALLS,
  "llm.provider_flow_bootstrap_context_invalid": END_MODEL_CALLS,
  "llm.provider_evidence_loop_context_invalid": END_MODEL_CALLS,
  "llm.provider_request_limits_invalid": END_MODEL_CALLS,
  "llm.provider_request_timeout_invalid": END_MODEL_CALLS,
  "llm.provider_input_budget_exceeded": END_MODEL_CALLS,
  "llm.provider_credential_in_request": END_MODEL_CALLS,
  "llm.provider_request_construction_failed": END_MODEL_CALLS,
  "llm.provider_request_setup_failed": END_MODEL_CALLS,
  // The caller's key was unavailable, the provider rejected it, or the endpoint
  // tried to send the call somewhere else: none of it changes on a retry.
  "llm.provider_secret_unavailable": END_MODEL_CALLS,
  "llm.provider_auth_failed": END_MODEL_CALLS,
  "llm.provider_redirect_rejected": END_MODEL_CALLS,
  // Cancelled from outside. A cancellation is final.
  "llm.provider_aborted": END_MODEL_CALLS,
  // The provider billed past the call's ceiling, so every estimate made from
  // here is an underestimate and the run's budget can no longer be promised.
  "llm.provider_usage_limit_exceeded": END_MODEL_CALLS,
  // The network, or the provider being unavailable for a moment.
  "llm.provider_timeout": "spend_call",
  "llm.provider_network_error": "spend_call",
  "llm.provider_rate_limited": "spend_call",
  "llm.provider_http_error": "spend_call_on_server_error",
  // The model: a reply that arrived and could not be used.
  "llm.provider_malformed_response": "spend_call",
  "llm.provider_output_invalid": "spend_call",
  "llm.provider_output_truncated": "spend_call",
  "llm.provider_output_padding_truncated": "spend_call",
  "llm.provider_response_oversize": "spend_call",
  // An inconsistent usage report is a bad reply, not an overspend; the call is
  // charged its worst case, which is what an unreadable report is charged.
  "llm.provider_usage_invalid": "spend_call"
} as const satisfies Record<AutomationStudioLlmProviderErrorCode, AutomationStudioLlmProviderFailureDisposition>);

const DISPOSITIONS: Readonly<Record<string, AutomationStudioLlmProviderFailureDisposition>> = AUTOMATION_STUDIO_LLM_PROVIDER_FAILURE_DISPOSITIONS;

/**
 * Whether a provider failure, named by its code and HTTP status, was only a
 * spent call: the model's reply or the network, never the credential or the
 * request itself.
 *
 * Anything that is not a provider code -- including the harness's own
 * `llm.provider_request_failed`, which is what an untyped exception becomes --
 * is not a spent call.
 */
export function automationStudioLlmProviderFailureSpendsCall(failure: { code: string; status?: number | undefined }): boolean {
  const disposition = Object.hasOwn(DISPOSITIONS, failure.code) ? DISPOSITIONS[failure.code] : undefined;
  if (disposition === "spend_call") return true;
  if (disposition !== "spend_call_on_server_error") return false;
  return Number.isInteger(failure.status) && (failure.status as number) >= 500 && (failure.status as number) <= 599;
}

/**
 * The same question about a thrown error, read by its code and status and never
 * by its message. Only a real provider error qualifies: the provider adapter
 * throws nothing else, so an object that merely looks like one did not come
 * from the provider and is not given the benefit of the doubt.
 */
export function automationStudioLlmProviderErrorSpendsCall(error: unknown): boolean {
  if (!(error instanceof AutomationStudioLlmProviderError)) return false;
  const failure = normalizedAutomationStudioLlmProviderFailure(error);
  return automationStudioLlmProviderFailureSpendsCall({ code: failure.code, status: failure.status });
}
