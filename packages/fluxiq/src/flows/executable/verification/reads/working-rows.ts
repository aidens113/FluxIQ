/**
 * Core's flag on a read whose rows are working rows
 * (`AutomationStudioResultReadAccount.workingRows`, t752): node ids, and
 * Core's sentence for them.
 */

export type ResultWorkingRows = {
  /** The later read of the same list, whose rows are the answer. */
  rereadBy: string;
  /** The steps repeated once per row of this read that succeeded before that later read ran, in run order. */
  repeatedBy: string[];
  /** How Core found the two reads read one list: the loop's rows come from this read, and both have one read target. */
  sameList: "items_edge_and_read_target";
  /** Core's sentence: what was measured, and what it means for the answer. */
  said: string;
};
