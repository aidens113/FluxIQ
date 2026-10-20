// The closed set of conditions a site-reset refusal can name as failed
// (t743, rerun round 4: job `run-mvgw1854-5d10955b`, photo
// `run-mvgw7320-de416190`). A refusal that named no condition left the builder
// varying its call against a reason it could not see until the repeat guard
// ended its brief; every refusal now names one of these, generically, and says
// whether any call can meet it (`./refusal.ts`, `./condition-words.ts`).

/** Every condition a site-reset refusal may name, in no particular order. */
export const AUTOMATION_STUDIO_SITE_RESET_FAILED = [
  // Undo admission (`../undo-admission.ts`).
  "already_back",
  "control_state_differs",
  "control_elsewhere",
  "consequence_not_inverse",
  "undeclared_press",
  "subject_differs",
  "no_item_identity",
  "no_destination_read_before",
  "destination_not_read_now",
  "subject_there_before",
  "subject_not_present_now",
  "no_exact_inverse",
  "transfer_not_witnessed",
  "not_own_item",
  // Claims under `undoes` (`../ledger.ts`, `claim` and `target`).
  "act_kept",
  "act_left",
  "act_not_listed",
  "undo_spent",
  "destination_unissued",
  // Trials (`../trial-policy.ts`, `../ledger.ts`).
  "acts_in_place",
  "acts_not_settled",
  "start_differs",
  // Acts no call can settle (`../reset-settlement/judge.ts`, `gate_unsatisfiable`): what each failed on, and the trial refused on them.
  "witness_unreachable",
  "nothing_to_name",
  "acts_unsettleable",
  // Presses before the seal (`../create-baselines.ts`, `../reset-witness.ts`).
  "no_witness",
  "no_destination_original"
] as const;

/** One condition a site-reset refusal names as failed. */
export type AutomationStudioSiteResetFailed = (typeof AUTOMATION_STUDIO_SITE_RESET_FAILED)[number];
