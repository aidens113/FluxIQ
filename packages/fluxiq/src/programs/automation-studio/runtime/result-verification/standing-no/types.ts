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
  keptOut?: AutomationStudioResultStandingNoKeptOutRow[] | undefined;
};

/**
 * One row a condition alone left out that Core's record accounts for (t641,
 * `../refuted-no/types.ts`, `AutomationStudioResultNoAccounted`): `also_in_result`,
 * another copy of it kept; `request_words`, a value Core read on it failing
 * the request's own words, `texts`.
 */
export type AutomationStudioResultStandingNoKeptOutRow = { label: string; by: "also_in_result" | "request_words"; texts?: string[] | undefined };

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

/**
 * A condition Core's record showed leaves out only rows the request does not
 * ask for, as a gate keeps it across its build's trials (t641,
 * `./kept-conditions.ts`). Core-only: a refusal names it in Core's words.
 */
export type AutomationStudioResultKeptCondition = {
  /** As the lines of the trial that showed it named it: `condition N (wording)`. */
  name: string;
  /** The revision whose trial showed it. */
  revision: number;
  /** The condition as that revision wrote it, as JSON with its keys sorted: what a later submission is matched by (`./written-conditions.ts`). */
  written: string;
  /** Each row it alone left out, with how Core's record accounts for it. */
  keptOut: AutomationStudioResultStandingNoKeptOutRow[];
};

/** What carries a gate's kept conditions to the submission it is asked about, outside what a model is shown: the result a gate keeps for a trial (t641). */
export type AutomationStudioResultKeptConditionsCarrier = { keptConditions?: AutomationStudioResultKeptCondition[] | undefined };

/** Core's finding that a submission drops or changes kept conditions (`./kept-condition-drop.ts`, t641). */
export type AutomationStudioResultKeptConditionDrop = {
  /** The kept conditions it no longer writes as they were written. */
  dropped: AutomationStudioResultKeptCondition[];
  /** Core's words for the builder: each condition, as written, and the rows it keeps out. */
  said: string;
};
