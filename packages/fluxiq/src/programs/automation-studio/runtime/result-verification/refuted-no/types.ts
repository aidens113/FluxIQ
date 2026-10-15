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
   */
  quotesRequest: boolean;
  /** Where `quotesRequest`: the request's words the condition tests, and the value Core's read found on this row. */
  quoted?: { texts: string[]; read: string } | undefined;
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
