/**
 * Core's codes for a verdict a model call reached, or failed to. The last two
 * are for a first answer other than `yes` that a second call with the same
 * evidence did not settle (`agreement.ts`): one of the two said `yes`, or
 * neither did and they did not both say `no`.
 */
export const AUTOMATION_STUDIO_RESULT_VERDICT_CODES = Object.freeze({
  answers: "core.result.answers_request",
  /** A yes whose same reply said the Flow needs a change (`patchNeeded: true`, header): not confirmed as a runtime check's single yes (`agreement.ts`). */
  answersWithChangeAdvised: "core.result.answers_with_change_advised",
  doesNotAnswer: "core.result.does_not_answer_request",
  unsure: "core.result.verdict_unsure",
  silent: "core.result.verdict_absent",
  unavailable: "core.result.verdict_unavailable",
  disagree: "core.result.verdicts_disagree",
  unconfirmed: "core.result.refutation_unconfirmed",
  /** A no whose every reason Core's own record refutes, asked once more and still not standing (`../refuted-no/`, t607): unsure. */
  refutationContradicted: "core.result.refutation_contradicted",
  /** A no naming no defect Core can find in its record of the result, asked once more to list each and still naming none (`../agreement/unsupported-no.ts`, t752): unsure, never a no. */
  refutationUnsupported: "core.result.refutation_unsupported",
  /** A yes on a run that stored none of the records the build declared its task asks for, with no sign the empty answer is honest (`../requested-output/`, t757): unsure, never a yes. */
  requestedOutputMissing: "core.result.requested_output_missing"
} as const);
