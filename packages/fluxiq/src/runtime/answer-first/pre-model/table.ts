// What each refusal made before any model call becomes on the answer-first path (plan, "Keep
// Going Until The Result": "Each one is either resolved automatically or becomes a setup step
// that says what to do. None is reported as a failed task"). Old modes keep their refusals.
//
// **Closed over the code lists,** by type: a code added to `generation-failure/codes.ts` and not
// named here fails to compile, and `./tests/table.test.ts` walks the lists at run time too.
//
// **Three ways to resolve one:**
//
//   - `not_asked`: this path has no use for what the check protects. An attempt proposes nothing
//     and writes nothing to the Flow, so a proposal waiting and a Flow that has steps stop nothing.
//   - `fresh_round`: the refusal is of one request, built from what the round was holding, and a
//     fresh round builds another from a small window (the keep-going table's own answer). If a
//     fresh round cannot get past it with nothing spent, it becomes a setup step after all.
//   - `budget_out`: a spending authority refused. An attempt passes no run budget today, so this
//     does not arise; it says what would be right if it did.
//
// **A setup step** starts no attempt and says what to do, in words with no code in them, since a
// person reads them. `say` on a resolved code is what is said if it is raised all the same: a
// Flow that is not there refuses under the same code as one that is not blank.
//
// **Scope.** The stage `pre_provider_validation`, `provider_resolution`, and the provider's own
// refusals before a request goes out. The rest of `provider_request` did reach, or may have
// reached, a provider, and is the keep-going table's.

/** The codes this table answers for. */
export type AutomationStudioAnswerFirstPreModelCode = keyof typeof AUTOMATION_STUDIO_ANSWER_FIRST_PRE_MODEL;

export type AutomationStudioAnswerFirstPreModelStep =
  | { does: "resolve"; by: "not_asked" | "fresh_round" | "budget_out"; say: string }
  | { does: "setup"; say: string };

const TRY_AGAIN = "Something went wrong getting this ready, before anything was done or spent. Please ask again. If it keeps happening, the FluxIQ logs say which check refused.";
const REQUEST_REFUSED = "I could not put the request for the model together, so nothing was sent and nothing was spent. Please ask again. If it keeps happening, the FluxIQ logs say which check refused.";
const MODEL_SETTINGS = "The model limits for this Flow are not usable, so nothing was sent. Check the Flow's model settings, then ask again.";
const NO_MODEL = "No model is available for this. Add or unlock a model key in FluxIQ's settings, then ask again.";
const NO_TARGET = "FluxIQ cannot reach what this works on right now. Connect it in FluxIQ, then ask again.";
const NO_BALANCE = "This task's spending limit refused the first request, so nothing was sent. Raise the limit in the Flow's settings, then ask again.";

const setup = (say: string): AutomationStudioAnswerFirstPreModelStep => ({ does: "setup", say });
const notAsked = (say: string): AutomationStudioAnswerFirstPreModelStep => ({ does: "resolve", by: "not_asked", say });
const freshRound = (say: string): AutomationStudioAnswerFirstPreModelStep => ({ does: "resolve", by: "fresh_round", say });
const budgetOut = (say: string): AutomationStudioAnswerFirstPreModelStep => ({ does: "resolve", by: "budget_out", say });

/** Each pre-model refusal, and what it becomes (header). */
export const AUTOMATION_STUDIO_ANSWER_FIRST_PRE_MODEL = Object.freeze({
  // pre_provider_validation: what a build checks before it can start.
  "flow_bootstrap.pre_provider_validation_failed": setup(TRY_AGAIN),
  "flow_bootstrap.invalid_input": setup("That request was missing what it needs, such as which Flow it is for. Start it again from the chat."),
  "flow_bootstrap.generation_lock_failed": setup("Another task on this Flow would not let go, so this one did not start. Wait for it to finish or press Stop, then ask again."),
  "flow_bootstrap.blank_target_required": notAsked("I could not find this Flow. Check it still exists, or start from a new one."),
  "flow_bootstrap.canonical_settings_binding_unavailable": setup("I could not read this Flow's settings. Open the Flow once to check it loads, then ask again."),
  "flow_bootstrap.pending_adaptation_exists": notAsked(TRY_AGAIN),
  "flow_bootstrap.pending_adaptation_check_failed": notAsked(TRY_AGAIN),
  "flow_bootstrap.active_instructions_required": setup("I do not have anything to do yet. Tell me what you want done, then I can start."),
  "flow_bootstrap.instruction_resolution_failed": setup("I could not read what you asked for. Say it again in the chat, then I can start."),
  "flow_bootstrap.bootstrap_context_failed": setup(TRY_AGAIN),
  "flow_bootstrap.node_catalog_unavailable": setup(NO_TARGET),
  "flow_bootstrap.required_capabilities_unavailable": setup("The steps this needs are not available here. Update FluxIQ and connect it, then ask again."),
  "flow_bootstrap.evidence_runtime_unavailable": setup(NO_TARGET),
  // The harness, refusing a request it built. Each is of that one request, or of its limits.
  "flow_bootstrap.harness_preflight_failed": freshRound(REQUEST_REFUSED),
  "flow_bootstrap.pre_provider_input_budget_exceeded": freshRound(REQUEST_REFUSED),
  "flow_bootstrap.pre_provider_request_context_unbounded": freshRound(REQUEST_REFUSED),
  "flow_bootstrap.pre_provider_request_limits_invalid": setup(MODEL_SETTINGS),
  "flow_bootstrap.pre_provider_request_construction_failed": freshRound(REQUEST_REFUSED),
  "flow_bootstrap.pre_provider_request_setup_failed": freshRound(REQUEST_REFUSED),
  "flow_bootstrap.pre_provider_input_limit_exceeded": freshRound(REQUEST_REFUSED),
  "flow_bootstrap.pre_provider_request_total_exceeded": freshRound(REQUEST_REFUSED),
  "flow_bootstrap.pre_provider_invalid_cost_limit": setup(MODEL_SETTINGS),
  "flow_bootstrap.pre_provider_invalid_timeout": setup(MODEL_SETTINGS),
  "flow_bootstrap.pre_provider_invalid_token_limits": setup(MODEL_SETTINGS),
  "flow_bootstrap.pre_provider_context_invalid": freshRound(REQUEST_REFUSED),
  "flow_bootstrap.request_refused_evidence_denied_key": freshRound(REQUEST_REFUSED),
  "flow_bootstrap.request_refused_routing_denied_key": freshRound(REQUEST_REFUSED),
  "flow_bootstrap.request_refused_denied_keys_undeclared": setup(MODEL_SETTINGS),
  "flow_bootstrap.request_refused_reusable_context_invalid": freshRound(REQUEST_REFUSED),
  "flow_bootstrap.request_refused_diagnosis_misplaced": freshRound(REQUEST_REFUSED),
  "flow_bootstrap.request_refused_failure_evidence_invalid": freshRound(REQUEST_REFUSED),
  "flow_bootstrap.request_refused_exploration_evidence_invalid": freshRound(REQUEST_REFUSED),
  // A run budget, which an attempt does not pass (`FLOW_BOOTSTRAP_RUN_BUDGET_CODES` says why a build never meets these).
  "flow_bootstrap.run_budget_calls_exhausted": budgetOut(NO_BALANCE),
  "flow_bootstrap.run_budget_total_tokens_exhausted": budgetOut(NO_BALANCE),
  "flow_bootstrap.run_budget_output_tokens_exhausted": budgetOut(NO_BALANCE),
  "flow_bootstrap.run_budget_cost_exhausted": budgetOut(NO_BALANCE),
  "flow_bootstrap.run_budget_duplicate_request": freshRound(REQUEST_REFUSED),
  "flow_bootstrap.run_budget_reservation_invalid": freshRound(REQUEST_REFUSED),
  // provider_resolution: no model to ask.
  "flow_bootstrap.provider_resolution_failed": setup(NO_MODEL),
  "flow_bootstrap.provider_resolver_unavailable": setup(NO_MODEL),
  "flow_bootstrap.provider_resolution_invalid": setup(NO_MODEL),
  // The provider's own refusals before a request goes out.
  "flow_bootstrap.provider_secret_reference_invalid": setup(NO_MODEL),
  "flow_bootstrap.provider_model_unsupported": setup("This Flow names a model FluxIQ cannot send to. Choose another in the Flow's settings, then ask again."),
  "flow_bootstrap.provider_response_limit_invalid": setup(MODEL_SETTINGS),
  "flow_bootstrap.provider_request_identity_invalid": freshRound(REQUEST_REFUSED),
  "flow_bootstrap.provider_request_scope_invalid": freshRound(REQUEST_REFUSED),
  "flow_bootstrap.provider_request_context_unbounded": freshRound(REQUEST_REFUSED),
  "flow_bootstrap.provider_request_task_mismatch": freshRound(REQUEST_REFUSED),
  "flow_bootstrap.provider_recent_actions_invalid": freshRound(REQUEST_REFUSED),
  "flow_bootstrap.provider_failure_evidence_invalid": freshRound(REQUEST_REFUSED),
  "flow_bootstrap.provider_exploration_evidence_invalid": freshRound(REQUEST_REFUSED),
  "flow_bootstrap.provider_result_summary_invalid": freshRound(REQUEST_REFUSED),
  "flow_bootstrap.provider_recovery_context_invalid": freshRound(REQUEST_REFUSED),
  "flow_bootstrap.provider_flow_bootstrap_context_invalid": freshRound(REQUEST_REFUSED),
  "flow_bootstrap.provider_evidence_loop_context_invalid": freshRound(REQUEST_REFUSED),
  "flow_bootstrap.provider_request_limits_invalid": setup(MODEL_SETTINGS),
  "flow_bootstrap.provider_request_timeout_invalid": setup(MODEL_SETTINGS),
  "flow_bootstrap.provider_input_budget_exceeded": freshRound(REQUEST_REFUSED),
  "flow_bootstrap.provider_credential_in_request": freshRound(REQUEST_REFUSED),
  "flow_bootstrap.provider_request_construction_failed": freshRound(REQUEST_REFUSED),
  "flow_bootstrap.provider_request_setup_failed": freshRound(REQUEST_REFUSED)
} as const satisfies Record<string, AutomationStudioAnswerFirstPreModelStep>);

/** What a code becomes here, or nothing for one this table does not answer for. */
export function automationStudioAnswerFirstPreModelStep(code: string): AutomationStudioAnswerFirstPreModelStep | undefined {
  return Object.hasOwn(AUTOMATION_STUDIO_ANSWER_FIRST_PRE_MODEL, code) ? AUTOMATION_STUDIO_ANSWER_FIRST_PRE_MODEL[code as AutomationStudioAnswerFirstPreModelCode] : undefined;
}
