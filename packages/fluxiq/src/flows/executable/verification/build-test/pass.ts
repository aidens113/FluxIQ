import type { BuildTestStep } from "./step.ts";
import type { JsonValue } from "@fluxiq/contracts/core";

/**
 * One pass of a repeated step as the judge of its test reads it (t252 D6).
 *
 * The row is named by its label only, the label the list read's `readRows`
 * gave it, screened as those are (`build-test/read-rows.ts`); a row's values
 * never travel here.
 */

export type BuildTestPass = {
  /** 1-based: the row's place in the list. */
  pass: number;
  /** The row's label from the list the span repeats over; absent when that list named none for it. */
  row?: string;
  outcome: BuildTestStep["outcome"];
  /** What the test observed on this pass, by the same rule as a step's `observed`. */
  observed?: JsonValue;
};
