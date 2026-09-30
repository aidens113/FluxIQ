// Every reason a Flow Bootstrap generation can end, grouped by the phase of the
// build that produced it. A code belongs to exactly one stage, which is what
// lets a reader recover the stage from the code alone.
import {
  FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODE_LIST,
  FLOW_BOOTSTRAP_RUN_BUDGET_CODE_LIST
} from "./harness-vocabulary.ts";

export type AutomationStudioFlowBootstrapFailureStage =
  | "pre_provider_validation"
  | "provider_resolution"
  | "provider_request"
  | "provider_output_validation"
  | "post_provider_validation"
  | "persistence";

export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PHASE_FAILURE_CODES = {
  pre_provider_validation: [
    "flow_bootstrap.pre_provider_validation_failed",
    "flow_bootstrap.invalid_input",
    "flow_bootstrap.generation_lock_failed",
    "flow_bootstrap.blank_target_required",
    "flow_bootstrap.canonical_settings_binding_unavailable",
    "flow_bootstrap.stale_grant_binding",
    "flow_bootstrap.pending_adaptation_exists",
    "flow_bootstrap.pending_adaptation_check_failed",
    "flow_bootstrap.active_instructions_required",
    "flow_bootstrap.instruction_resolution_failed",
    "flow_bootstrap.bootstrap_context_failed",
    "flow_bootstrap.node_catalog_unavailable",
    "flow_bootstrap.required_capabilities_unavailable",
    "flow_bootstrap.evidence_runtime_unavailable",
    "flow_bootstrap.harness_preflight_failed",
    "flow_bootstrap.pre_provider_input_budget_exceeded",
    "flow_bootstrap.pre_provider_request_context_unbounded",
    "flow_bootstrap.pre_provider_request_limits_invalid",
    "flow_bootstrap.pre_provider_request_construction_failed",
    "flow_bootstrap.pre_provider_request_setup_failed",
    "flow_bootstrap.pre_provider_input_limit_exceeded",
    "flow_bootstrap.pre_provider_request_total_exceeded",
    "flow_bootstrap.pre_provider_invalid_cost_limit",
    "flow_bootstrap.pre_provider_invalid_timeout",
    "flow_bootstrap.pre_provider_invalid_token_limits",
    "flow_bootstrap.pre_provider_context_invalid",
    // A model request Core refused to build, one code per guard
    // (`runtime/llm/harness/request-refusal.ts`). Each was a plain throw that
    // arrived as `flow_bootstrap.unexpected_error` at `provider_request`, which
    // is all `run-mulxk0ro-36bf090d`'s wrong-answer repair left of itself: which
    // guard refused, and that no provider was ever called, were both lost.
    // Pre-provider because a refused request is never sent.
    "flow_bootstrap.request_refused_evidence_denied_key",
    "flow_bootstrap.request_refused_routing_denied_key",
    "flow_bootstrap.request_refused_denied_keys_undeclared",
    "flow_bootstrap.request_refused_reusable_context_invalid",
    "flow_bootstrap.request_refused_diagnosis_misplaced",
    "flow_bootstrap.request_refused_failure_evidence_invalid",
    "flow_bootstrap.request_refused_exploration_evidence_invalid",
    // The run's spending authority, refused before anything was sent. Pre-provider
    // because that is what a refused reservation is: the harness never calls the
    // provider. They used to arrive on the path that carries provider metadata,
    // so without a name here they came out as a provider transport failure --
    // see `FLOW_BOOTSTRAP_RUN_BUDGET_CODES`, which also says which live runs this
    // was and was not the cause of.
    ...FLOW_BOOTSTRAP_RUN_BUDGET_CODE_LIST
  ],
  provider_resolution: [
    "flow_bootstrap.provider_resolution_failed",
    "flow_bootstrap.provider_resolver_unavailable",
    "flow_bootstrap.provider_resolution_invalid",
    // The grant that authorises the call, refused. One code per refusal Core
    // distinguishes, because the four are different problems with different
    // answers: gone or spent, asked under the wrong scope, minted against a
    // world that has since changed, or a purpose that is not one of Core's.
    //
    // Without them a refused grant fell out of the catch as whatever stage the
    // build had reached, which for a build that got as far as its loop is
    // `flow_bootstrap.provider_request_failed` -- a code saying a request was
    // attempted and its answer unknown, true of nothing that happened, since
    // no request was ever made. The first two runs in which the wrong-answer
    // repair reached a build, `run-muhqop38-997ee8e5` and
    // `run-muhrf6c4-9714939f`, both recorded exactly that, with no provider
    // status because there was no response to have one.
    "flow_bootstrap.execution_grant_unavailable",
    "flow_bootstrap.execution_grant_scope_mismatch",
    "flow_bootstrap.execution_grant_no_longer_valid",
    "flow_bootstrap.execution_grant_purpose_invalid"
  ],
  provider_request: [
    "flow_bootstrap.provider_request_failed",
    "flow_bootstrap.provider_auth_failed",
    "flow_bootstrap.provider_rate_limited",
    "flow_bootstrap.provider_timeout",
    "flow_bootstrap.provider_aborted",
    "flow_bootstrap.provider_redirect_rejected",
    "flow_bootstrap.provider_http_error",
    "flow_bootstrap.provider_network_error",
    "flow_bootstrap.provider_secret_unavailable",
    // The grant was revoked or replaced while the provider was answering: the
    // one grant refusal raised after a request went out, so it belongs here and
    // not with the four resolution refusals above, which all say nothing was sent.
    "flow_bootstrap.execution_grant_revoked_in_flight",
    // What the catch actually caught, where it recognised nothing else.
    //
    // `flow_bootstrap.provider_request_failed` is this stage's default, and the
    // catch used it for every unrecognised throw -- so it read as "a request was
    // attempted and its answer is unknown" for failures where no request was
    // ever made. Four consecutive runs of the wrong-answer repair recorded it
    // with no provider status, and it named nothing: the grant refusals were
    // ruled out by giving them their own codes and the code did not change.
    //
    // These three separate the kinds that remain. `aborted_or_timed_out` is a
    // DOMException, which is what an abort and a deadline both arrive as;
    // `internal_error` is a TypeError or a RangeError, which is a defect in
    // Core rather than a condition of the run; `unexpected_error` is anything
    // else thrown deliberately with a message, which is most of Core's own
    // guards. The message never travels -- only which of the three it was.
    "flow_bootstrap.aborted_or_timed_out",
    "flow_bootstrap.internal_error",
    "flow_bootstrap.unexpected_error",
    // No longer produced. Kept so a diagnostic stored before the provider's
    // pre-flight refusals were split still parses.
    "flow_bootstrap.provider_configuration_invalid",
    // Still produced, by two paths: the harness's own `llm.provider_request_failed`,
    // which says a request failed and says nothing else, and any harness
    // diagnostic whose code this projection does not recognise.
    //
    // It used to be grouped with the code above under a comment reading "no
    // longer produced", which was never true of it -- `run-muhs8hx3-6fd929e6`
    // and `run-muhtuizo-c458e49c` both recorded it four commits after that
    // comment was written. The comment is corrected rather than the code: for a
    // failure whose kind the harness did not name, "a request whose answer is
    // unknown" is the one honest thing left to say.
    //
    // What those two runs hit was the *first* path, not the second: a build
    // passes no run budget, so the refused-reservation reading of them was wrong,
    // and `llm.provider_request_failed` -- the answer for a throw Core could not
    // structurally type -- is the only shape that fits what they recorded. A code
    // reaching the second path is still a gap in this projection and is still to
    // be named; it now travels as an issue code so the next one can be.
    "flow_bootstrap.provider_transport_unknown",
    ...FLOW_BOOTSTRAP_PROVIDER_PREFLIGHT_CODE_LIST
  ],
  provider_output_validation: [
    "flow_bootstrap.provider_output_validation_failed",
    "flow_bootstrap.evidence_completion_wrapper_invalid",
    "flow_bootstrap.evidence_completion_plan_invalid",
    "flow_bootstrap.evidence_completion_profile_limit_exceeded",
    // The bound domain would not turn a completed plan's parameters into ones
    // its nodes can run with: a handle it never issued or that went stale, a
    // handle with no resolver bound, or parameters it refused outright.
    "flow_bootstrap.evidence_completion_parameters_unresolved",
    // The Flow the build wrote could not answer the instruction whatever it did:
    // the instruction asks for a set of records and no step of the Flow produces
    // or saves one (`../answerability/`). Raised only after the exploration was
    // told what was missing and finished again without it.
    "flow_bootstrap.evidence_completion_cannot_answer",
    // The Flow could not run at all: it acts on the target it was told to start
    // at and no step of it goes there (`../reachability/`). Raised the same way.
    "flow_bootstrap.evidence_completion_cannot_reach_start",
    "flow_bootstrap.provider_response_malformed",
    "flow_bootstrap.provider_response_oversize",
    "flow_bootstrap.provider_output_padding_truncated",
    "flow_bootstrap.provider_output_truncated",
    "flow_bootstrap.provider_usage_invalid",
    "flow_bootstrap.provider_usage_limit_exceeded",
    "flow_bootstrap.provider_output_invalid",
    "flow_bootstrap.provider_output_oversize",
    "flow_bootstrap.evidence_invalid_configuration",
    "flow_bootstrap.evidence_invalid_decision",
    "flow_bootstrap.evidence_unknown_tool",
    // No longer produced: the loop gives a reused call id one of its own and
    // answers a repeated request itself. Kept so a stored diagnostic still parses.
    "flow_bootstrap.evidence_duplicate_call",
    "flow_bootstrap.evidence_duplicate_tool_request",
    // The exploration kept repeating itself -- asking again for what it already
    // had, or to look again with nothing changed -- until the no-progress guard.
    "flow_bootstrap.evidence_repeat_without_progress",
    "flow_bootstrap.evidence_tool_failed",
    "flow_bootstrap.evidence_limit",
    "flow_bootstrap.evidence_iteration_limit",
    "flow_bootstrap.evidence_cancelled",
    // The model kept answering with something the exploration could not use --
    // malformed, failing Core's checks, timing out -- so it was stopped: the
    // same refusals came back until the no-progress guard, or refusals ran
    // unbroken to the far backstop.
    "flow_bootstrap.evidence_unusable_decision",
    // Building the Flow needed an action with a lasting consequence the build
    // was not permitted. Not a failure of the build: the diagnostic carries
    // the request a person grants or refuses, and a build whose grant holds
    // what it asks for can take the action.
    "flow_bootstrap.permission_required"
  ],
  post_provider_validation: ["flow_bootstrap.post_provider_validation_failed"],
  persistence: ["flow_bootstrap.persistence_failed"]
} as const;

export type AutomationStudioFlowBootstrapPhaseFailureCode =
  typeof AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PHASE_FAILURE_CODES[keyof typeof AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PHASE_FAILURE_CODES][number];

/** The stage a code belongs to. A code appears under exactly one stage, so this is total. */
export const FLOW_BOOTSTRAP_PHASE_FAILURE_CODE_STAGE = new Map<string, AutomationStudioFlowBootstrapFailureStage>(
  Object.entries(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PHASE_FAILURE_CODES)
    .flatMap(([stage, codes]) => codes.map((code) => [code, stage as AutomationStudioFlowBootstrapFailureStage] as const))
);

/**
 * The pre-provider codes whose diagnostic carries the request's accounting.
 * Unlike every other pre-provider failure, each is a refusal the harness made
 * with a request already built, so its accounting is the only record of the call
 * that never happened -- and the parser admits accounting for exactly these. A
 * `pre_provider_` prefix test would also catch the phase's default code, which
 * never carries accounting, and so refuse a diagnostic Core itself produced.
 */
const FLOW_BOOTSTRAP_HARNESS_PREFLIGHT_CODES = [
  "flow_bootstrap.harness_preflight_failed",
  "flow_bootstrap.pre_provider_input_budget_exceeded",
  "flow_bootstrap.pre_provider_request_context_unbounded",
  "flow_bootstrap.pre_provider_request_limits_invalid",
  "flow_bootstrap.pre_provider_request_construction_failed",
  "flow_bootstrap.pre_provider_request_setup_failed",
  "flow_bootstrap.pre_provider_input_limit_exceeded",
  "flow_bootstrap.pre_provider_request_total_exceeded",
  "flow_bootstrap.pre_provider_invalid_cost_limit",
  "flow_bootstrap.pre_provider_invalid_timeout",
  "flow_bootstrap.pre_provider_invalid_token_limits",
  "flow_bootstrap.pre_provider_context_invalid",
  ...FLOW_BOOTSTRAP_RUN_BUDGET_CODE_LIST
] as const satisfies readonly AutomationStudioFlowBootstrapPhaseFailureCode[];

export const FLOW_BOOTSTRAP_HARNESS_PREFLIGHT_CODE_SET: ReadonlySet<string> = new Set(FLOW_BOOTSTRAP_HARNESS_PREFLIGHT_CODES);

/** The code a stage falls back to when nothing more specific is established. */
export const FLOW_BOOTSTRAP_DEFAULT_PHASE_FAILURE_CODE: Record<
  AutomationStudioFlowBootstrapFailureStage,
  AutomationStudioFlowBootstrapPhaseFailureCode
> = {
  pre_provider_validation: "flow_bootstrap.pre_provider_validation_failed",
  provider_resolution: "flow_bootstrap.provider_resolution_failed",
  provider_request: "flow_bootstrap.provider_request_failed",
  provider_output_validation: "flow_bootstrap.provider_output_validation_failed",
  post_provider_validation: "flow_bootstrap.post_provider_validation_failed",
  persistence: "flow_bootstrap.persistence_failed"
};
