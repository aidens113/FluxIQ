import type { ResultStandingNoKeptOutRow } from "./kept-out-row.ts";

// The shapes Core keeps of a build test's standing no across a build's trials
// (t633, `./index.ts`). Core-only: none of it is shown to a model; the gate
// that keeps a build's trials says what it found in Core's own words.

/** One condition the judged result was read with, as Core's account gives it (`../refuted-no/record-conditions.ts`). */

export type ResultStandingNoCondition = {
  /** As every line names it: `condition N (wording)`. */
  name: string;
  /**
   * Its wording as one revision's is compared with another's: lower case,
   * spaces made one, and Core's aside on the value it read on a kept row
   * (`(read "..." on a row it kept)`) left out. Absent where the account gives no wording.
   */
  key?: string | undefined;
  /** The labels of the rows it alone left out, where its read counted and sent them all. */
  leftOutAlone?: string[] | undefined;
  /** The read or saved answer it belongs to, by node id, as Core's account gives it: where a gate finds it as its revision wrote it (t641). */
  nodeId?: string | undefined;
  /** Its number there (`condition N`). */
  number?: number | undefined;
  /**
   * Where it alone left out at least one row and Core's record accounts for
   * every one -- another copy of it is in the result, or Core read a value on it
   * that fails the request's own words -- those rows, each with how: it left out
   * nothing the request asks for (t641). Absent otherwise.
   */
  keptOut?: ResultStandingNoKeptOutRow[] | undefined;
  /**
   * Where it leaves rows out for having something (a presence test keeping the
   * rows that lack a value, or a negated text test) and Core read, on at least
   * one row it alone left out, a value the request itself says to leave out
   * (`../refuted-no/request-text-test.ts`, its exclusion reading), and on none a
   * value it does not: the request's words for what it leaves out (t687,
   * `../standing-no-record/request-exclusion.ts`). Absent otherwise.
   */
  excludes?: string[] | undefined;
  /**
   * Where it is such a test and Core read, on a row it alone left out with no
   * other copy in the result, a value the request does not say to leave out:
   * those rows' labels -- by Core's own reading, rows the request asks for
   * (t687). Absent where none.
   */
  askedFor?: string[] | undefined;
};
