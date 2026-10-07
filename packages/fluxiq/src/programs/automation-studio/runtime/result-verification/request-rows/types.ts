// The shapes this directory reads a summary's rows into (`summary-reads.ts`),
// shared by the flag (`left-out-naming-the-item.ts`), the check of a yes
// (`unaccounted-rows.ts`) and the check of a no (`checked-rows.ts`).

/** One condition of a read, with the rows it alone left out. */
export type AutomationStudioRequestRowsCondition = {
  /** The condition as the read names it: a field key in a test, the authored wording in a run, else `condition N`. */
  condition: string;
  /** The rows as the read gave them: `label — column: value` where it said the tested value. */
  rows: string[];
  /** The same rows by label alone, in the same order. */
  labels: string[];
  /**
   * True when the condition tested the label's own column. For a build test,
   * when every row is said by its label alone: its replay says the tested cell
   * after every other label, empty as `(no value)`. For a finished run, as the
   * read's account says (`../read-account/accounts.ts`, `testedLabel`), from the
   * authored condition: a run's row is also said by its label alone when the
   * tested column was not stored (live run `run-mux6naez-6c20f26e`, `plus is
   * present` over a Flow storing name, price, rating and url).
   */
  testedLabel: boolean;
};

/** One list read, as the rows a summary holds for it. */
export type AutomationStudioRequestRowsRead = {
  /** A build test's step number. */
  step?: number;
  /** A finished run's read node. */
  nodeId?: string;
  /**
   * The labels of the rows the read kept: a test's `readRows.rows`; for a run,
   * the stored labels no condition of this read left out alone.
   */
  kept: string[];
  /** The labels in the result: a test's `readRows.rows`, a run's every stored label. */
  inResult: string[];
  conditions: AutomationStudioRequestRowsCondition[];
  /** Every distinct label of the read, kept, stored or left out: what a row has to be told apart from. */
  labels: string[];
};

/** A finished run's stored row: its label and every text cell, for an id a judgement names. */
export type AutomationStudioRequestRowsStored = { label: string; cells: string[] };

/**
 * The rows Core's check of a judgement named as left out by one condition of
 * one read (`checked-rows-named.ts`), read from Core's own `checked` lines: what
 * a repair compares a rerun of that read against (`rerun-rows.ts`, live run
 * `run-mux6naez-6c20f26e`, R3-3). Labels as the read gave them, and the ids the
 * line named each row by.
 */
export type AutomationStudioRequestRowsNamed = {
  /** A build test's step number, as the line says it. */
  step?: number;
  /** A finished run's read node, as the line says it. */
  nodeId?: string;
  /** The condition, as the read names it. */
  condition: string;
  rows: Array<{ label: string; ids?: string[] }>;
};

/** What a rerun of a read did to the rows Core's check named (`rerun-rows.ts`): the ones it keeps, the ones still left out, and Core's sentence saying so. */
export type AutomationStudioRequestRowsAfterRerun = { kept: string[]; stillLeftOut: string[]; said: string };
