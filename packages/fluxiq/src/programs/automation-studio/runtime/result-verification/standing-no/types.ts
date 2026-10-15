// The shapes Core keeps of a build test's standing no across a build's trials
// (t633, `./index.ts`). Core-only: none of it is shown to a model; the gate
// that keeps a build's trials says what it found in Core's own words.

/** One condition the judged result was read with, as Core's account gives it (`../refuted-no/record-conditions.ts`). */
export type AutomationStudioResultStandingNoCondition = {
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
};

/** One no of the trial that Core's record does not wholly refute (`../refuted-no/weigh.ts`). */
export type AutomationStudioResultStandingNoCall = {
  call: 1 | 2;
  /**
   * The keys of the conditions its advice changes, removes or loosens and
   * nothing else (`../refuted-no/advice-condition.ts`), where its reading names
   * no row besides; absent where it asks or claims anything more.
   */
  drops?: string[] | undefined;
};

/** Core's record of one build test that was judged no (header). */
export type AutomationStudioResultStandingNoRecord = {
  /** The labels of the rows the judged result stored. */
  stored: string[];
  /** True when `stored` is every row the result stored: no record set cut short, every one's rows read back whole. */
  storedWhole: boolean;
  /** Every condition of every read and saved answer the result was judged on. */
  conditions: AutomationStudioResultStandingNoCondition[];
  /**
   * The labels of the stored rows a standing no called not the kind of thing
   * the request asks for: an exclusion of its advice says what each is
   * (`../request-rows/unstated-exclusions.ts`, t628). Absent where none.
   */
  upheldKind?: string[] | undefined;
  /** Each no of the trial Core's record does not wholly refute. */
  standing: AutomationStudioResultStandingNoCall[];
};

/**
 * What carries Core's record of a no, outside what a model is shown: a
 * verification (`AutomationStudioResultVerification`, set only on a build
 * test's double no by `../agreement.ts`, never on a runtime check, never
 * recorded on a run), and a trial's result, beside its feedback.
 */
export type AutomationStudioResultStandingNoCarrier = { standingNo?: AutomationStudioResultStandingNoRecord | undefined };

/** Core's finding that a later no's remedy would take back what an earlier standing no upheld (`./contradiction.ts`). */
export type AutomationStudioResultStandingNoContradiction = {
  /** The earlier revision whose standing no called rows not the asked kind. */
  revision: number;
  /** How many of those rows; never their labels. */
  rows: number;
  /** The later revision's conditions the no asks to remove, as lines name them. */
  conditions: string[];
  /** Core's words for the builder: what its record shows, naming no row. */
  said: string;
};
