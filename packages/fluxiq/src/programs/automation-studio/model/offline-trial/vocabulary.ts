// The closed vocabularies of the trial evidence result contract
// (trace-offline-trials-plan, Decisions 2 and 3; source plan section 8).
// Each list is frozen and complete: the validator refuses any other spelling,
// so a new verdict, origin, scope or reason is a deliberate edit here, never a
// string a caller invents.

/** What a trial concluded. `inconclusive` is an evidence gap, never a soft pass. */
export const AUTOMATION_STUDIO_TRIAL_EVIDENCE_VERDICTS = Object.freeze(["pass", "fail", "inconclusive"] as const);

/**
 * Where the evidence behind a result came from. `recorded`: traces of what Core
 * received during an earlier live run. `pure_computation`: computed from data
 * already held, with no observation. `live`: observed in a live run now.
 * `modeled`: synthetic or modeled input.
 */
export const AUTOMATION_STUDIO_TRIAL_EVIDENCE_ORIGINS = Object.freeze(["recorded", "pure_computation", "live", "modeled"] as const);

/**
 * How much of the Flow the result covers. A `full_recorded_path` is still a
 * historical scenario; only `full_live_run` is a whole run against the live
 * target.
 */
export const AUTOMATION_STUDIO_TRIAL_EVIDENCE_SCOPES = Object.freeze(["supplied_state", "segment", "full_recorded_path", "full_live_run"] as const);

/**
 * Why a result is not a pass, or what evidence it lacked. Closed. Among them:
 * `source_not_live`: an offline trial's source trace is not a live episode's
 * capture (it was derived or replayed), so it holds no live evidence to run on;
 * `judgement_unavailable`: the task-goal judge gave no verdict (it was not
 * asked, or it was unsure), so the goal is neither met nor missed.
 */
export const AUTOMATION_STUDIO_TRIAL_EVIDENCE_REASON_CODES = Object.freeze([
  "missing_transition",
  "argument_mismatch",
  "ambiguous_context",
  "missing_artifact",
  "incomplete_capture",
  "incompatible_contract",
  "unsupported_timing",
  "assertion_failure",
  "future_read_blocked",
  "live_effect_blocked",
  "model_request_changed",
  "stale_checkpoint",
  "redacted_input",
  "offline_not_allowed_in_phase",
  "source_not_live",
  "judgement_unavailable"
] as const);

/** How one checked assertion came out. `unverified` means its evidence was unavailable. */
export const AUTOMATION_STUDIO_TRIAL_EVIDENCE_ASSERTION_OUTCOMES = Object.freeze(["satisfied", "violated", "unverified"] as const);

/**
 * Whether a result is the record its trial produced (`original`) or a copy
 * that left Core and came back through export and re-ingest (`derived`).
 */
export const AUTOMATION_STUDIO_TRIAL_EVIDENCE_PROVENANCES = Object.freeze(["original", "derived"] as const);
