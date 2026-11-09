// What the judge is shown as the before side when acts an earlier attempt made are carried and the
// reading from before them is not held (`./witnesses.ts`). Without it, a judge shown those acts and
// no before reading asks for one, and no look can give it after the acts. **It names no site, task
// or thing**: model guidance never teaches to the test.

export const AUTOMATION_STUDIO_ANSWER_FIRST_EARLIER_BEFORE_WORDS = {
  /** No reading of the before side was taken in this attempt either. */
  notHeld: "The acts marked already done were made by an earlier attempt at this task, which took the reading from before them. That reading is not held here, and none can be taken now, after them: so there is no reading from before those acts to show.",
  /** This attempt read its before side, which was after the carried acts. */
  takenAfter: "This reading was taken by this attempt before its own first lasting act, after the acts marked already done, which an earlier attempt made: it already shows their change. The reading from before them is not held here, and none can be taken now."
} as const;
