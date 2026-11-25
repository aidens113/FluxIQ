// The words of Core's note on a before side it holds no reading from before for (`./earlier-before-note.ts`, t1043):
// what the judge is told when acts an earlier attempt made are carried into this attempt and the reading from before
// them is not held (`framework/.../answer-first/witnesses/witnesses.ts`). **They name no site, task or thing**: model
// guidance never teaches to the test.

/** The words of the note, one for each case. */
export const AUTOMATION_STUDIO_JUDGE_EARLIER_BEFORE_WORDS = {
  /** No reading of the before side was taken in this attempt either. */
  notHeld: "The acts marked already done were made by an earlier attempt at this task, which took the reading from before them. That reading is not held here, and none can be taken now, after them: so there is no reading from before those acts to show.",
  /** This attempt read its before side, which was after the carried acts. */
  takenAfter: "This reading was taken by this attempt before its own first lasting act, after the acts marked already done, which an earlier attempt made: it already shows their change. The reading from before them is not held here, and none can be taken now."
} as const;
