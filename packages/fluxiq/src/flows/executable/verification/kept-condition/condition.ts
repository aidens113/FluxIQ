import type { ResultStandingNoKeptOutRow } from "../standing-no/index.ts";

/**
 * A condition Core's record showed leaves out only rows the request does not
 * ask for, as a gate keeps it across its build's trials (t641,
 * `./kept-conditions.ts`). Core-only: a refusal names it in Core's words.
 */

export type ResultKeptCondition = {
  /** As the lines of the trial that showed it named it: `condition N (wording)`. */
  name: string;
  /** The revision whose trial showed it. */
  revision: number;
  /** The condition as that revision wrote it, as JSON with its keys sorted: what a later submission is matched by (`./written-conditions.ts`). */
  written: string;
  /**
   * Each row it alone left out, with how Core's record accounts for it; for a
   * set, each row they left out together. Empty only for a condition kept by
   * the request's own words for what it leaves out (`excludes`, t687), whose
   * rows Core did not account for every one of.
   */
  keptOut: ResultStandingNoKeptOutRow[];
  /**
   * Present where the condition leaves rows out by what the request itself
   * says to leave out (t687, `./kept-conditions.ts`): the request's words. Such
   * a condition is kept until a later record shows it leaving out a row Core
   * reads as asked for (`askedFor`), never on rows Core cannot account for.
   */
  excludes?: string[] | undefined;
  /**
   * Present for a set of conditions kept as one (t666): each, as the trial's
   * lines named it and as its revision wrote it, two or more. `name` then
   * names them all, and `written` is their written forms as one JSON list,
   * sorted: what a refusal is remembered by. A later plan writes the set still
   * where it writes any one of them as written.
   */
  members?: Array<{ name: string; written: string }> | undefined;
};
