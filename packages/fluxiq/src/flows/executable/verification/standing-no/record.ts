import type { ResultStandingNoCall } from "./call.ts";
import type { ResultStandingNoCondition } from "./condition.ts";
import type { ResultStandingNoLocated } from "./located.ts";
import type { ResultStandingNoTogether } from "./together.ts";

/** Core's record of one build test that was judged no (header). */

export type ResultStandingNoRecord = {
  /**
   * `core` where the no was Core's own, with no judge asked (a computed fact
   * that fails, `../computed-facts/computed-no.ts`); absent for a judge's no.
   * Marks whose finding the record is.
   */
  source?: "core" | undefined;
  /** The defects the no named that Core located in its record, as Core located them (P5b); absent where none. */
  located?: ResultStandingNoLocated[] | undefined;
  /** The labels of the rows the judged result stored. */
  stored: string[];
  /** True when `stored` is every row the result stored: no record set cut short, every one's rows read back whole. */
  storedWhole: boolean;
  /** Every condition of every read and saved answer the result was judged on. */
  conditions: ResultStandingNoCondition[];
  /**
   * The labels of the stored rows a standing no called not the kind of thing
   * the request asks for: an exclusion of its advice says what each is
   * (`../request-rows/unstated-exclusions.ts`, t628). Absent where none.
   */
  upheldKind?: string[] | undefined;
  /** Each no of the trial Core's record does not wholly refute. */
  standing: ResultStandingNoCall[];
  /**
   * Each set of two or more conditions of one read that left rows out only
   * together (t655), where that read's listing of such rows is complete
   * (`../refuted-no/record.ts`, `together`): what a gate keeps as one when
   * Core's record accounts for every such row (t666, `./kept-conditions.ts`).
   * Absent where no read listed one.
   */
  together?: ResultStandingNoTogether[] | undefined;
};
