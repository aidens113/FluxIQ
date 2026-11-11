// What a fresh round is told when the round before it was stopped at loop detection's last rung
// (plan D14, step 4, as R7 revised it). The attempt does not park there: it steers itself onto a
// different way and keeps going until the result or the budget is gone (`../attempt/rounds.ts`).
//
// Generic and Core's words: what happened and what to do instead. What was tried is beside it in
// the same note (`tried`, `./told-fresh-round.ts`), and the person's words, once they have
// answered, are under `personSaid` (`../attempt/round-note.ts`). It never tells the model to wait
// for the person: the person's answer is guidance when it comes, never a condition for going on.

import type { JsonObject } from "../../../../../core/index.ts";

const STOPPED = "The last round kept repeating itself after it was steered and after fresh starts, so it was stopped and this round starts fresh from the page as it stands. Everything under tried was already done and did not get there: the same calls on the same page are refused again. Take a different way to the result: another control, another page, another reading of what the page shows, or another kind of step. Keep going until you have the result.";
const ASKED = "The person has also been asked what to do. Do not wait for them: carry on now. If they answer, their words are under personSaid in a later round.";

/** The note for the round after a stopped loop; `asked` says a question to the person is open. */
export function automationStudioAnswerFirstStuckSteer(asked: boolean): JsonObject {
  return { words: STOPPED, ...(asked ? { personAsked: ASKED } : {}) };
}
