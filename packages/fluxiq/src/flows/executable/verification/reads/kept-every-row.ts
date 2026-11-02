/**
 * Core's flag on a read that kept every item it saw after an act was repeated
 * over a narrower read of the same list (`../read-account/kept-every-row.ts`,
 * t692). Node ids and counts, and Core's sentence for them.
 */

export type ResultKeptEveryRow = {
  /** The earlier read whose kept rows the act was repeated over. */
  narrowerRead: string;
  /** What that read saw and kept. */
  narrowerSeen: number;
  narrowerKept: number;
  /** The lasting steps repeated once per row of that read that succeeded at least once, in run order. */
  actedBy: string[];
  /** How Core found the two reads read one list: the loop's rows come from the earlier read, and both have one read target. */
  sameList: "items_edge_and_read_target";
  /** Core's sentence: what was measured, and the check it asks for. */
  said: string;
  /**
   * The record sets this read stored, by dataset id, as the run's own record
   * says (`../result-summary.ts`): the sets whose writers or collecting passes
   * name it. Each row of them a yes must name beside the request's words
   * (`../request-rows/unquoted-rows.ts`). Absent where none is known.
   */
  storedIn?: string[];
};
