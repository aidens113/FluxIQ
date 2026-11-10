/**
 * What a replay accepted on its own record was checked by, in a person's words (task speed S9,
 * `./replay-stands.ts`): the result's `checkedWhat`, which the answer shows after "Checked:". Nothing judged it again, and it says so. The
 * chat's answer reads the same words to tell the person what happened (`runtime/conversations/
 * commands/answer-first/outcome.ts`), never "checked once against what you asked".
 */
export const AUTOMATION_STUDIO_ANSWER_FIRST_ON_RECORD_WORDS = "ran exactly as the run you accepted, every step as saved and the same kind of rows read, so no new check was needed.";
