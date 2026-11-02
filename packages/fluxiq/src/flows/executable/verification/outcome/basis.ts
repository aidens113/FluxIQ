/** How a verdict was reached. Recorded so a reader can tell a judgement from an unanswered question. */

export type ResultVerdictBasis =
  /** Core's own arithmetic over the result reached it; no model was asked. */
  | "core_observation"
  /** The model was asked and answered. */
  | "model"
  /** The model was asked and its answer carried no verdict. */
  | "model_silent"
  /** The call was made or attempted and did not come back usable. */
  | "model_unavailable"
  /**
   * The model judged the result not to answer, or could not tell, was asked
   * once more with the same evidence, and judged that it does -- or, on a
   * verification that confirms answers (the build-test judge's `confirmAnswer`),
   * judged that it answers and then that it does not. Two different answers to
   * one question settle nothing, so neither is taken over the other.
   */
  | "model_disagreed"
  /**
   * The model was asked twice with the same evidence and never judged that the
   * result answers, nor twice that it does not: `no` then `unknown`,
   * `unknown` then `no` or `unknown`, or a second call that gave no answer.
   * That is not proof the run failed.
   */
  | "model_unconfirmed";
