// Why a granted call was refused, as a closed reason beside the grant's code.
//
// **Every throw on a granted call used to be a plain `Error`, and each one was
// recorded as a provider transport failure.** The grant wraps the provider, so
// its refusals are thrown from inside `provider.runTask`; the provider-retry seam
// normalises anything it cannot type to `llm.provider_request_failed`, and the
// Flow Bootstrap projection names that `flow_bootstrap.provider_transport_unknown`
// -- "a request whose answer is unknown" -- for a call the grant refused before
// any request existed. Live run `run-mun5e1ie-5aeefbbd` (2026-09-29) ended its
// build that way on its first call, with a valid key and a working network, and
// its record could not say which of fourteen checks had refused it.
//
// So each check now refuses with the grant's own code -- one of the four in
// `refusal.ts`, which every existing caller already reads -- and a reason
// that says which check it was. The reason is closed, so it can travel as an
// issue code without carrying a sentence.
import {
  AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_REFUSAL_CODES as CODES,
  AutomationStudioLlmExecutionGrantRefusal
} from "./refusal.ts";

/** Each reason a granted call can be refused for, and the grant code it is refused under. */
export const AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_CALL_REFUSAL_REASONS = Object.freeze({
  /** The grant is not in the store, or not claimed: revoked, closed, or never this run's. */
  grant_gone: CODES.unavailable,
  /** The claimed grant's run lease ended. */
  lease_expired: CODES.unavailable,
  /** Every call the grant authorised has been made. */
  uses_spent: CODES.unavailable,
  /** The caller cancelled the call before it started. */
  cancelled: CODES.unavailable,
  /** A second call arrived while the first was still in flight. */
  call_in_progress: CODES.unavailable,
  /** The call's worst-case cost would exceed what the grant may still spend. */
  cost_exhausted: CODES.unavailable,
  /** The call's worst-case tokens would exceed the grant's run token budget. */
  tokens_exhausted: CODES.unavailable,
  /** Secret Keys would not mint the credential release this call needed. */
  reveal_unavailable: CODES.unavailable,
  /** The grant was revoked or replaced while the provider was answering. */
  revoked_in_flight: CODES.unavailable,
  /** The call names a project, Flow or purpose other than the grant's. */
  scope_mismatch: CODES.scope_mismatch,
  /** The request asks for a task, timeout, cost or token limit beyond the grant's. */
  request_exceeds_grant: CODES.scope_mismatch,
  /** The person's session is gone, or belongs to someone else. */
  session_invalid: CODES.no_longer_valid,
  /** The key is gone, disabled, or rotated since the grant was minted. */
  key_changed: CODES.no_longer_valid,
  /** The Flow's execution digest or settings revision changed since the grant was minted. */
  flow_changed: CODES.no_longer_valid
} as const);

export type AutomationStudioLlmExecutionGrantCallRefusalReason = keyof typeof AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_CALL_REFUSAL_REASONS;

/** The reasons whose refusal came after the provider had answered: the only ones where a request was sent. */
const AFTER_RESPONSE: ReadonlySet<AutomationStudioLlmExecutionGrantCallRefusalReason> = new Set(["revoked_in_flight"]);

/** A refusal for this reason, under its grant code, keeping Core's own sentence. */
export function automationStudioLlmExecutionGrantCallRefusal(reason: AutomationStudioLlmExecutionGrantCallRefusalReason, message: string): AutomationStudioLlmExecutionGrantRefusal {
  return new AutomationStudioLlmExecutionGrantRefusal(AUTOMATION_STUDIO_LLM_EXECUTION_GRANT_CALL_REFUSAL_REASONS[reason], message, reason);
}

/** Whether a refusal with this reason was raised after the provider answered, so a request did go out. */
export function automationStudioLlmExecutionGrantRefusedAfterResponse(reason: AutomationStudioLlmExecutionGrantCallRefusalReason | undefined): boolean {
  return reason !== undefined && AFTER_RESPONSE.has(reason);
}

/**
 * Which part of a claimed grant's world has changed underneath it, or nothing.
 * The session is checked first, then the key, then the Flow, which is the order
 * a person would fix them in.
 */
export function automationStudioLlmExecutionGrantInvalidity(input: {
  session: { user: { id: string } } | null | undefined;
  actorUserId: string;
  key: { enabled: boolean; kind: string; updatedAtMs: number } | null | undefined;
  binding: { executionDigest: string; settingsRevision?: number | undefined };
  grant: { keyUpdatedAtMs: number; executionDigest: string; settingsRevision?: number | undefined };
}): AutomationStudioLlmExecutionGrantCallRefusalReason | undefined {
  if (!input.session || input.session.user.id !== input.actorUserId) return "session_invalid";
  if (!input.key || !input.key.enabled || input.key.kind !== "llm" || input.key.updatedAtMs !== input.grant.keyUpdatedAtMs) return "key_changed";
  if (input.binding.executionDigest !== input.grant.executionDigest || input.binding.settingsRevision !== input.grant.settingsRevision) return "flow_changed";
  return undefined;
}
