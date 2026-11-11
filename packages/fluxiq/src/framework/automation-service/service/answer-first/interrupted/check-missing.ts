// What an attempt's ending says when it stopped on a check only a person can clear, with nobody to
// ask. It is the one `waiting_for_person` row that really did end its work, so a read must not
// call it interrupted, and these words on its result are the only mark it leaves
// (`./interrupted-view.ts`). A row written while a question was still open never holds them.

export const AUTOMATION_STUDIO_ANSWER_FIRST_CHECK_MISSING = "It needs a person to clear a check on the page before it can go on.";

/**
 * The same, as rows written before R7 hold it: an attempt that kept getting stuck parked there. No
 * attempt parks on a loop now (`../attempt/rounds.ts`, steered and never parked), so nothing new
 * writes these words, but `./interrupted-view.ts` still reads them on those older rows, and they
 * must stay exactly as those rows hold them.
 */
export const AUTOMATION_STUDIO_ANSWER_FIRST_STUCK_MISSING = "It kept getting stuck and there was nobody to ask whether to keep going, so it stopped here without spending more.";
