/**
 * The verdict on whether a finished run's result answers the request.
 *
 * Three words, because two would force a model with no view to guess. `unsure`
 * exists so that "I cannot tell" is sayable, and it is emphatically not a pass:
 * `automationStudioResultVerificationAnswers` is the one reader of these
 * values, and only `answers` passes. What any other verdict does to the run
 * is `automationStudioResultVerificationFailsRun`'s to say: it fails the run
 * unless two checks of the same result did not settle it.
 */

export type ResultVerdict = "answers" | "does_not_answer" | "unsure";
