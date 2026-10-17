// The shapes this directory reads a summary's rows into (`summary-reads.ts`),
// shared by the flag (`left-out-naming-the-item.ts`), the check of a yes
// (`unaccounted-rows.ts`) and the check of a no (`checked-rows.ts`).

/** One condition of a read, with the rows it alone left out. */
export type AutomationStudioRequestRowsCondition = {
  /**
   * The condition as every line names it (`../read-account/condition-name.ts`,
   * t574): `condition N (wording)` in a run, N its place in the authored
   * `where` from 1; in a test, `condition N (field)` where the replay numbered
   * it, else `condition "field"`. A saved answer's is prefixed
   * `recordOutput.process.where`.
   */
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
  /**
   * The rows Core settled itself (`../value-readings/settled-rows.ts`, t574):
   * their labels, and the word runs a sentence names this condition by -- its
   * `condition N`, its column, and the numbers its bound writes. A yes need
   * not quote beside these rows, only once beside a naming of the condition.
   */
  settled?: { labels: string[]; names: string[][] };
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
  /**
   * A finished run's left-out labels that another read stored and this read did
   * not (`summary-reads.ts`, t691), each with the reads that stored it. Absent when
   * there are none, and on a build test's read.
   */
  storedElsewhere?: Array<{ label: string; by: string[] }>;
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

/**
 * One text condition's left-out rows that state a number within the range of
 * numbers the rows it kept state (`left-out-stating-a-kept-number.ts`, t478).
 * `low` and `high` are the lowest and highest number a kept row states; `rows`
 * the rows as the read gave them, and `numbers` the number each states, in the
 * same order.
 */
export type AutomationStudioRequestRowsKeptNumberLeftOut = {
  nodeId: string;
  condition: string;
  low: number;
  high: number;
  rows: string[];
  numbers: number[];
};

/**
 * One condition's left-out rows a yes did not account for by the request's own
 * words (`unquoted-rows.ts`, t515): rows that condition alone left out of the
 * result, as the read gave them, that no sentence of the reply both names and
 * quotes the request's words excluding.
 */
export type AutomationStudioRequestRowsUnquoted = {
  step?: number;
  nodeId?: string;
  condition: string;
  rows: string[];
  /**
   * True when the rows are ones Core settled (t574): the yes did not quote,
   * in any sentence naming this condition, the request's words stating its
   * bound. Absent for rows the yes did not quote beside.
   */
  bound?: true;
  /**
   * The reads that stored the rows, where this condition left them out of what
   * the Flow acted on and another read stored them (t691,
   * `storedThoughLeftOut`): the yes did not name each in a sentence that names
   * that read and quotes the request's words asking for it in the answer.
   * Absent for every other kind of row.
   */
  stored?: string[];
};

/**
 * What the judge's copy adds to a read condition (`summary-with-also-in-result.ts`,
 * t691): `storedThoughLeftOut`, the rows of `leftOutOnlyByThis`, as given
 * there, that another read stored and this read did not, and `storedAnyway`,
 * Core's sentence naming those reads and what a yes must show of each row.
 */
export type AutomationStudioRequestRowsStoredMark = { storedThoughLeftOut?: string[]; storedAnyway?: string };

/**
 * Rows the result keeps that Core measured as unlike every other row it keeps
 * (t663): `column`, the rows alone with no value in a column the answer stores
 * (`kept-without-asked-column.ts`); `item`, the rows whose names alone lack the
 * request's phrase, as the request writes it, that every other kept row's name
 * writes (`kept-not-naming-the-item.ts`); `every_row`, every row a read stored
 * that kept every item it saw after an act over a narrower read of the same
 * list (t692, `unquoted-rows.ts`). `missing` is that column's id or that
 * phrase as the request says it, or, for `every_row`, the narrower read's node id; `rows` the rows by label; `of` how many rows
 * were measured; `pool` every label a row has to be told apart from. A flag,
 * never a verdict: whether the request asks for the row is the judge's to say.
 */
export type AutomationStudioRequestRowsKept = {
  kind: "column" | "item" | "every_row";
  /** The record set the rows are stored in, for a column or every-row flag. */
  datasetId?: string;
  /** A build test's step number, for an item flag on a test's read. */
  step?: number;
  /** A finished run's read node, for an item flag on a run's read, or the read an every-row flag is on. */
  nodeId?: string;
  missing: string;
  rows: string[];
  of: number;
  pool: string[];
};
