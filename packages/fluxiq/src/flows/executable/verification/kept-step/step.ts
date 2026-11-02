/**
 * A step of the trial's Flow that chose, in a named group the page showed, an
 * option whose words are the request's own, as the revision that ran wrote it
 * (t666, `./kept-steps.ts`). Core-only: a hint names it in Core's words.
 */

export type ResultKeptStep = {
  /** Its node id in the trial, and its label where the trial gave one. */
  nodeId: string;
  label?: string | undefined;
  /** The group it chose in and the option it chose, as the page showed them. */
  group: string;
  chose: string;
  /** The request's words the option's words are (`../refuted-no/request-text-test.ts`). */
  texts: string[];
  /** The revision whose trial showed it. */
  revision: number;
  /** Its parameters as that revision wrote them, as JSON with keys sorted (`./written-conditions.ts`). */
  written: string;
};
