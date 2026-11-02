import type { ResultStandingNoKeptOutRow } from "./kept-out-row.ts";

/**
 * One set of conditions of one read that left rows out only together (t655,
 * t666): no one of them left those rows out by itself, so dropping one keeps
 * them out and dropping every one brings them back.
 */

export type ResultStandingNoTogether = {
  /** The read, by node id, as its conditions' own `nodeId`. */
  nodeId: string;
  /** Its conditions' numbers there (`condition N`), two or more, ascending. */
  numbers: number[];
  /** The labels of the rows that failed exactly these conditions. */
  rows: string[];
  /**
   * Where Core's record accounts for every one of those rows and there is at
   * least one -- another copy of it in the result, or a value Core read on it
   * that fails the request's own words -- those rows, each with how. Absent
   * otherwise.
   */
  keptOut?: ResultStandingNoKeptOutRow[] | undefined;
};
