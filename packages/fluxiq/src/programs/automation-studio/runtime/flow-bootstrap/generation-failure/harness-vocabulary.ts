// The refusal vocabularies that arrive from the LLM harness, under their Flow
// Bootstrap names.
//
// Both are keyed by the type that owns them, so a refusal added there fails
// this file's type check until it is named here, and both are written as
// literals rather than derived at run time. That is not a style choice: these
// tables are built while this module is being evaluated, the DeepSeek adapter
// reads values out of this directory, and `runtime/llm/` and this directory are
// therefore a module cycle. A table here that read a `runtime/llm/` value would
// read it mid-evaluation, which is the one shape of that cycle that actually
// breaks -- and it breaks loudly, in the temporal dead zone of a `const`.
// `diagnostic-parse.ts` and `harness-failure.ts` do import a value across the
// same edge, and safely, because both call it from inside a function.
import type { AutomationStudioLlmExecutionGrantRefusalCode, AutomationStudioLlmProviderPreflightErrorCode, AutomationStudioLlmRunBudgetDiagnostic } from "../../llm/index.ts";

type ProviderPreflightSuffix<Code> = Code extends `llm.provider_${infer Suffix}` ? Suffix : never;

/**
 * Each provider refusal made before a request is sent, under its Flow-bootstrap
 * name. They all used to arrive as one `llm.provider_configuration_invalid` and
 * leave as one `flow_bootstrap.provider_configuration_invalid`, so a refusal
 * could not say which check made it.
 */
export const FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODES: {
  readonly [Code in AutomationStudioLlmProviderPreflightErrorCode]: `flow_bootstrap.provider_${ProviderPreflightSuffix<Code>}`
} = Object.freeze({
  "llm.provider_secret_reference_invalid": "flow_bootstrap.provider_secret_reference_invalid",
  "llm.provider_model_unsupported": "flow_bootstrap.provider_model_unsupported",
  "llm.provider_response_limit_invalid": "flow_bootstrap.provider_response_limit_invalid",
  "llm.provider_request_identity_invalid": "flow_bootstrap.provider_request_identity_invalid",
  "llm.provider_request_scope_invalid": "flow_bootstrap.provider_request_scope_invalid",
  "llm.provider_request_context_unbounded": "flow_bootstrap.provider_request_context_unbounded",
  "llm.provider_request_task_mismatch": "flow_bootstrap.provider_request_task_mismatch",
  "llm.provider_recent_actions_invalid": "flow_bootstrap.provider_recent_actions_invalid",
  "llm.provider_failure_evidence_invalid": "flow_bootstrap.provider_failure_evidence_invalid",
  "llm.provider_exploration_evidence_invalid": "flow_bootstrap.provider_exploration_evidence_invalid",
  "llm.provider_result_summary_invalid": "flow_bootstrap.provider_result_summary_invalid",
  "llm.provider_recovery_context_invalid": "flow_bootstrap.provider_recovery_context_invalid",
  "llm.provider_flow_bootstrap_context_invalid": "flow_bootstrap.provider_flow_bootstrap_context_invalid",
  "llm.provider_evidence_loop_context_invalid": "flow_bootstrap.provider_evidence_loop_context_invalid",
  "llm.provider_request_limits_invalid": "flow_bootstrap.provider_request_limits_invalid",
  "llm.provider_request_timeout_invalid": "flow_bootstrap.provider_request_timeout_invalid",
  "llm.provider_input_budget_exceeded": "flow_bootstrap.provider_input_budget_exceeded",
  "llm.provider_credential_in_request": "flow_bootstrap.provider_credential_in_request",
  "llm.provider_request_construction_failed": "flow_bootstrap.provider_request_construction_failed",
  "llm.provider_request_setup_failed": "flow_bootstrap.provider_request_setup_failed"
});

export const FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODE_LIST = Object.values(FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODES);
export const FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODE_SET: ReadonlySet<string> = new Set(FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODE_LIST);

/**
 * Each refusal of the run's spending authority, under its Flow-bootstrap name.
 *
 * **These had no name here at all, and that is how a run that never reached the
 * provider could be recorded as a provider fault.** The harness used to refuse a
 * reservation before sending anything and return the provider's metadata anyway,
 * so `flowBootstrapHarnessFailure` took its provider branch, no arm matched, and
 * the `default` arm named it `flow_bootstrap.provider_transport_unknown` at
 * stage `provider_request` with `providerInvocation: "attempted"` -- a request
 * attempted whose answer is unknown, true of nothing that happened.
 *
 * They are pre-provider refusals, so their diagnostics say plainly that no
 * request was made -- and they keep the request's accounting, which is the only
 * record of the call that did not happen. Nothing else: no provider, no model,
 * no status, no usage, whichever branch the refusal arrives on.
 *
 * **Both halves of that fix are in, and the harness's half came second.** A
 * refused reservation no longer returns provider metadata (`runtime/llm/harness/run.ts`),
 * so these codes are reached through the pre-provider branch and the provider
 * branch's arm for them is unreachable from the harness -- kept as a guard, for
 * the reason given at that arm.
 *
 * **What the two runs that started this were not.** `run-muhs8hx3-6fd929e6` and
 * `run-muhtuizo-c458e49c` recorded `provider_transport_unknown` with no provider
 * status, no usage and no evidence loop, and t145 narrowed the cause to these six
 * refusals. That cannot be right: `runBudget` is passed to the harness by exactly
 * three production callers -- `recovery/annotation/exploration.ts`,
 * `recovery/annotation/patch-reserve.ts` and `result-verification/verify.ts` --
 * and a Flow Bootstrap build is none of them, so `reservation` is `null` for a
 * build and this branch cannot fire on one. Both runs were builds.
 *
 * The shape that does fit every field they recorded is `llm.provider_request_failed`,
 * which `normalizedAutomationStudioLlmProviderFailure` answers when a throw
 * cannot be structurally typed, projected by its own arm to
 * `provider_transport_unknown`. Their 167 s and 194 s are the calls that
 * succeeded before it: a harness-projected build failure carries no evidence-loop
 * counts and no per-call usage however many calls preceded it, so those nulls
 * were read as evidence of no call and are evidence of nothing. Established by
 * elimination, not observed -- which is why the `default` arm now publishes the
 * harness code it could not name, so the next such run answers the question
 * from its own record instead of from an argument about the other fields.
 */
export const FLOW_BOOTSTRAP_RUN_BUDGET_CODES = Object.freeze({
  "llm_budget.run_call_limit": "flow_bootstrap.run_budget_calls_exhausted",
  "llm_budget.run_total_limit": "flow_bootstrap.run_budget_total_tokens_exhausted",
  "llm_budget.run_output_limit": "flow_bootstrap.run_budget_output_tokens_exhausted",
  "llm_budget.run_cost_limit": "flow_bootstrap.run_budget_cost_exhausted",
  "llm_budget.duplicate_request": "flow_bootstrap.run_budget_duplicate_request",
  "llm_budget.invalid_reservation": "flow_bootstrap.run_budget_reservation_invalid"
} as const satisfies Record<AutomationStudioLlmRunBudgetDiagnostic["code"], `flow_bootstrap.run_budget_${string}`>);

export const FLOW_BOOTSTRAP_RUN_BUDGET_CODE_LIST = Object.values(FLOW_BOOTSTRAP_RUN_BUDGET_CODES);

/**
 * Core's four grant refusals under their Flow Bootstrap names. Read by the
 * build's own catch, for a grant refused while it was being resolved, and by the
 * harness projection, for a grant refused on a call -- which used to arrive as
 * `llm.provider_request_failed` and leave as `provider_transport_unknown`
 * (`runtime/llm/grant-refusal/call-refusal.ts`).
 */
export const FLOW_BOOTSTRAP_EXECUTION_GRANT_CODES = Object.freeze({
  "llm.execution_grant_unavailable": "flow_bootstrap.execution_grant_unavailable",
  "llm.execution_grant_scope_mismatch": "flow_bootstrap.execution_grant_scope_mismatch",
  "llm.execution_grant_no_longer_valid": "flow_bootstrap.execution_grant_no_longer_valid",
  "llm.execution_grant_purpose_invalid": "flow_bootstrap.execution_grant_purpose_invalid"
} as const satisfies Record<AutomationStudioLlmExecutionGrantRefusalCode, `flow_bootstrap.execution_grant_${string}`>);
