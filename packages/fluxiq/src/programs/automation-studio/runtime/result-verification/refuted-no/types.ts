// The shapes a no is weighed in against Core's own record of the result it
// judged (`./weigh.ts`, t607).

import type { AutomationStudioRequestPhrases } from "../request-rows/index.ts";

/** A row the result holds: its label (its first text column), and each text cell by column. */
export type AutomationStudioResultNoStoredRow = { label: string; cells: Readonly<Record<string, string>> };

/** A row one condition of one read alone left out, as the read gave it, and whether Core settled it (`../value-readings/settled-rows.ts`). */
export type AutomationStudioResultNoLeftOutRow = {
  label: string;
  /** The row as the read gave it: `label — column: value` where it said the tested value. */
  given: string;
  /** The condition as every line names it (`condition N (wording)`). */
  condition: string;
  /** True when Core read the row's tested value itself and found it failing the condition as written. */
  settled: boolean;
  /**
   * True when the row is settled and its condition tests the request's own
   * words (`./request-text-test.ts`, t629) over a read that kept rows: a row
   * that fails it does not say what the request asks for, by Core's own read.
   * Never where the condition tests the row's own label
   * (`./label-tested-condition.ts`, t651): Core read the name, not what the
   * request's word is about.
   */
  quotesRequest: boolean;
  /** Where `quotesRequest`: the request's words the condition tests, and the value Core's read found on this row. */
  quoted?: { texts: string[]; read: string } | undefined;
  /**
   * True when its condition tests the row's own label
   * (`./label-tested-condition.ts`, t651): Core read only that the name fails
   * it, never that the request does not ask for the row, so a no calling it
   * missing disputes that condition (`./missing-claim.ts`).
   */
  testsLabel?: true | undefined;
};

/**
 * How Core's record accounts for one row a condition alone left out (t631):
 * `request_words`, a settled row of a condition testing the request's own
 * words (`quotesRequest`), with those words; `also_in_result`, a row whose
 * label is also a row of the result, another copy of it kept.
 */
export type AutomationStudioResultNoAccounted = { by: "request_words"; texts: string[] } | { by: "also_in_result" };

/**
 * One condition of a read, or of a saved answer's `process.where`, as Core's
 * account gives it, whether or not it left a row out alone: what a no's advice
 * to change it is weighed against (`./record-conditions.ts`,
 * `./advice-condition.ts`, t631).
 */
export type AutomationStudioResultNoCondition = {
  /** The condition as every line names it (`condition N (wording)`), a saved answer's after `recordOutput.process.where`. */
  name: string;
  /** Its number, as a judge names it (`condition N`). */
  number: number;
  /**
   * Its wording as its account gives it, a saved answer's after
   * `recordOutput.process.where`; absent where the account gives none: what
   * one revision's condition is told apart from another's by (`../standing-no/`, t633).
   */
  wording?: string | undefined;
  /** The read it belongs to, by node id; a saved answer's condition, the node that collected the set. */
  nodeId: string;
  /** How many rows it rejected across the read, where the read counted them. */
  rejected?: number | undefined;
  /**
   * Each row it alone left out, by label, with how Core's record accounts for
   * it; absent where the read did not count them (`alone`) or did not send
   * every one, so Core cannot say what changing it brings back.
   */
  leftOut?: Array<{ label: string; accounted?: AutomationStudioResultNoAccounted | undefined }> | undefined;
};

/**
 * What a claim is weighed against: Core's own record of the judged result.
 * Built once per verification (`./record.ts`), never from a model's words.
 */
export type AutomationStudioResultNoRecord = {
  stored: AutomationStudioResultNoStoredRow[];
  leftOut: AutomationStudioResultNoLeftOutRow[];
  /** Each read's labels, kept, stored or left out: the pool a row's naming prefix is told apart in. */
  pools: string[][];
  /** The rows the result holds: what a stated count is held to. */
  storedCount: number;
  /** The rows the answer's own dedupe removed as repeating an earlier one, over every record set. */
  duplicatesRemoved: number;
  /**
   * True when every record set counted its repeats (`processing`) and no
   * build-test store says its answer removed one: `duplicatesRemoved` is then
   * the whole count, which a doubt about merged rows is weighed against
   * (`./dedupe-doubt.ts`, t628).
   */
  duplicatesCounted: boolean;
  /** Every step's node id, as the Flow names it. */
  nodeIds: string[];
  /** Every condition of every read and saved answer the result was judged on (t631): what a no's advice names by number. */
  conditions?: AutomationStudioResultNoCondition[] | undefined;
  /** Whether a text is a value Core read on a row -- a stored row's cell but its label, a left-out row's tested value -- and no row's label: a quote of one names no row (t631). */
  isValue?: ((text: string) => boolean) | undefined;
  /** The request's phrases (`../request-rows/request-phrases.ts`), where the request was given. */
  phrases?: AutomationStudioRequestPhrases | undefined;
  /** Whether a text's words run word for word in the request (`../request-rows/request-wording.ts`): a quote of the request names no row. */
  says?: ((text: string) => boolean) | undefined;
  /** The request phrase every stored row names first: the item asked for. Absent where they do not agree. */
  item?: string[] | undefined;
  /** A claim Core's agreement checks itself (pages, order): whether this sentence makes one, and whether the record refutes it. */
  other?: ((sentence: string) => AutomationStudioResultNoClaim | undefined) | undefined;
};

/** The rows one sentence names, and whether it names something Core cannot find in its record. */
export type AutomationStudioResultNoNamedRows = {
  stored: AutomationStudioResultNoStoredRow[];
  leftOut: AutomationStudioResultNoLeftOutRow[];
  /** True when the sentence names, by a quote or an id, a row Core holds no record of. */
  unmatched: boolean;
};

/** One claim a sentence makes, and Core's finding where its record refutes it. */
export type AutomationStudioResultNoClaim = { refuted: boolean; finding?: string };

/**
 * What Core's record says of a no's reading: `wholly` when the reading names
 * at least one claim Core checks and its record refutes every claim the
 * reading makes; `findings`, Core's words for each claim it refuted.
 */
export type AutomationStudioResultNoWeighed = { wholly: boolean; findings: string[] };
