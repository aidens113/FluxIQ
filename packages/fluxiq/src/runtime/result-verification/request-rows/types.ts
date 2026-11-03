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
   * `condition N`, its column (unless that column is one of the answer's own,
   * which every reply lists, t790), and the numbers its bound writes. A yes
   * need not quote beside these rows, only once, in a sentence that itself
   * names the condition and quotes the request (no quote lent, t790).
   */
  settled?: { labels: string[]; names: string[][]; kind: "bound" | "presence" | "text" };
  /**
   * The condition these rows failed, or, for rows several conditions left out
   * together, each of them (`summary-reads.ts`), as its sender says it.
   * Absent where the sender said neither a wording nor a field.
   */
  tests?: AutomationStudioRequestRowsTest[];
  /**
   * True for rows two or more conditions left out together (t655, debug of
   * `run-mvtdoyf3-47ffaac1`, F1): no one condition's value is the reason, so
   * none is settled, and each row is held to the request's own words.
   */
  together?: true;
  /**
   * For such a group whose every member is a condition Core settles -- one
   * whose own rows, those it alone left out, carry `settled`
   * (`../value-readings/settled-rows.ts`) -- each member (t795 w1b, social runs
   * `run-mvskodlp-9966d618` and `run-mvswewhy-e4e469d4`). The group's rows are
   * then accounted for exactly when every member is, by the settled rule
   * (`unquoted-rows.ts`), and are not named row by row. Absent on every other
   * group, and on every condition that is not a group.
   */
  settledMembers?: AutomationStudioRequestRowsSettledMember[];
  /** Per row, in `rows`' order, the value Core's read found on it for this condition (its witness), where it found one. Absent where none was sent. */
  witnesses?: Array<string | undefined>;
};

/**
 * One member of a group of conditions that left rows out together, where the
 * member is a condition Core settles (`AutomationStudioRequestRowsCondition`,
 * `settledMembers`): its name as every line names it, the word runs a sentence
 * names it by and the kind Core settled its own rows by, both as its own
 * `settled` says, and how its sender says it.
 */
export type AutomationStudioRequestRowsSettledMember = {
  condition: string;
  names: string[][];
  kind: "bound" | "presence" | "text";
  test: AutomationStudioRequestRowsTest;
};

/**
 * One condition a read's rows are tested by, as its sender says it
 * (`summary-reads.ts`): its number from 1 where the sender numbered it, and
 * either its wording, as a run's account or a saved answer's processing words
 * it (`../read-account/condition.ts`), or, for a build test's replay, which
 * names a condition by the field it tested alone, that field. What
 * `../asked-words/condition-words.ts` reads a condition's words from.
 */
export type AutomationStudioRequestRowsTest = { number?: number; wording?: string; field?: string };

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
  /**
   * Every condition of the read, whether it left rows out or not, and of the
   * saved answer it collected: what tells one condition's reason from
   * another's (`unquoted-rows.ts`, debug of `run-mvtdoyf3-47ffaac1`, F1 d).
   * Absent where the sender said none.
   */
  tests?: AutomationStudioRequestRowsTest[];
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
  /** With `bound`: what kind of condition Core settled the rows by, carried from `../value-readings/settled-rows.ts` so `../verdict/unquoted-line.ts` words the line by it and never re-parses the condition's wording. */
  boundKind?: "bound" | "presence" | "text";
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
