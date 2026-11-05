// What an attempt's ending says when it stopped on a check only a person can clear, with nobody to
// ask. It is the one `waiting_for_person` row that really did end its work, so a read must not
// call it interrupted, and these words on its result are the only mark it leaves
// (`./interrupted-view.ts`). A row written while a question was still open never holds them.

export const AUTOMATION_STUDIO_ANSWER_FIRST_CHECK_MISSING = "It needs a person to clear a check on the page before it can go on.";

/** The same, for an attempt that kept getting stuck with nobody to ask whether to go on: it stopped spending and waits (`./interrupted-view.ts`). */
export const AUTOMATION_STUDIO_ANSWER_FIRST_STUCK_MISSING = "It kept getting stuck and there was nobody to ask whether to keep going, so it stopped here without spending more.";
