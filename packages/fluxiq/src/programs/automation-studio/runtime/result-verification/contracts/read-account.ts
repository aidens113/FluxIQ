import type { AutomationStudioResultReadCondition } from "../read-condition.ts";

/**
 * How one read of a list went, as the judgement and the repair read it.
 *
 * **Why it exists.** `run-munq5s8x-6d620cdf`: the Flow's extraction followed
 * five pages, filtered on four conditions and kept one row per link, and the
 * check refuted its eight rows -- correctly -- then advised "add a pagination
 * loop ... and a filter/dedup step", every part of which the step already had.
 * It had been told "8 records stored" and a list of definition ids; the step's
 * parameters had been cut to fit the call. The re-author was told the same. So
 * neither could see that the read already paged, nor which of its conditions
 * rejected the rows the request wanted.
 *
 * Two sources, joined by node id. The counts are the read's own account of
 * itself, which the run record already holds (`service/summaries/
 * extraction-summary.ts` admits it on the attempt as `metadata.extraction`);
 * the conditions, the paging and the dedupe key are what the Flow authored the
 * step with. Counts, closed words, column ids and the model's own condition
 * wording -- no locator, and no page value but a condition's `leftOutOnlyByThis` row
 * labels with the value it tested on each, and the value its own read found,
 * each screened.
 */

export type AutomationStudioResultReadAccount = {
  nodeId: string;
  definitionId: string;
  /** Pages the read covered, the first included. */
  pagesRead: number;
  /** The most pages (or loads) the step was authored to read, when it pages and says. */
  pageLimit?: number;
  /** Why paging stopped: the read's own closed word (`page_limit`, `control_absent`, `rate_limited`, ...). Absent when it did not say. */
  stop?: string;
  /** True when a cap cut the read short. */
  truncated: boolean;
  /** Items the read looked at before its conditions, when it counted them. */
  itemsSeen?: number;
  /** Rows the read kept. */
  kept: number;
  /** Whether the step is authored to follow pages. Absent when its authored parameters were not in reach. */
  paginates?: boolean;
  /** Whether the step is authored to keep one row per key, in any form the domain reads a `dedupe` in. Absent when its authored parameters were not in reach. */
  dedupes?: boolean;
  /** The column ids a row is identified by, when the step names them. */
  dedupeBy?: string[];
  /**
   * True when the read moves page by page (`next`, numbered), and so leaves out
   * a row identical, field for field, to one an earlier page yielded, whatever
   * its `dedupe` says: by its own count, or by its authored paging where the
   * count did not reach the record. Absent otherwise.
   */
  dropsEarlierPageRepeats?: true;
  /**
   * How many rows its conditions kept the read left out as such repeats
   * (live run `run-muqk713g`: 12 kept, 10 stored, the other two these). Absent
   * where the read did not count them.
   */
  earlierPageRepeats?: number;
  /**
   * The step's conditions, in authored order, each with the rows it rejected
   * across the whole read. A row can fail more than one, so the counts need not
   * add up to what was dropped. `condition` is absent where the wording could
   * not be carried; the count still is. `alone` is how many of those rows the
   * condition removed by itself (every other condition kept them): the rows
   * that say whether the condition is right, where its whole count cannot
   * (`run-mup2u8o3-6697c4be`: an accessory rule rejected 20, 5 alone, 3 of them
   * true answers). Absent where the read did not count it. `leftOutOnlyByThis`
   * names those rows, each by its first text column (its title), whole, so the
   * judge can check them against the request (live run 15: three earbuds "with
   * Wireless Charging Case"); absent where the read did not send them. Where
   * the row holds the column the condition tested, the row is said with that
   * value after its label, `label — column: value` (t195-w34, live run
   * `run-murwcaj0-40e56557`: "Jonas Weber — mutualFriends: Aisha Khan and 4
   * other mutual friends", which a regex for five or more had dropped).
   * `testedLabel` is true where the condition tested the column each of those
   * rows is labelled by, decided from the authored condition and the rows' own
   * keys (`read-account/accounts.ts`), never from a row said by its label alone:
   * live run `run-mux6naez-6c20f26e` stored name, price, rating and url, so its
   * `plus is present` rows came by label alone, were taken as a test of the
   * label, and two non-Plus pairs naming a charging case were flagged as the
   * item asked for (`request-rows/left-out-naming-the-item.ts`).
   */
  conditions?: AutomationStudioResultReadCondition[];
  /** True when every row failed the conditions and the read answered with the unfiltered rows instead. */
  unfiltered?: boolean;
  /**
   * How many attempts of this step reported a read. Absent when one did. Outside
   * a loop the account is the last one's; inside one it is every pass's.
   */
  attempts?: number;
  /**
   * The rows the read kept on each page, in page order, when its step ran as a
   * pass of a loop (a repeat through the step that moves the list on; read-list
   * design 5.2). Then `pagesRead` counts every pass's pages, `kept`, `itemsSeen`
   * and each condition's counts add up every pass, `stop` is how the loop ended
   * (`ended`: the step that moves the list on answered there was no further
   * page; `bound`: the loop ran its most passes, which `pageLimit` gives where
   * the Flow states it; `failed`: a step of the loop failed), and `paginates` is
   * true. Absent outside a loop.
   */
  keptPerPage?: number[];
  /**
   * The steps that acted on the page before this read first ran, in run order
   * (`./narrowed-before.ts`, t482): a search, a filter, a sort, an option
   * chosen, a move to another page. The rows such a step removed never reached
   * the read, so no condition's `leftOutOnlyByThis` can show them. Lane C
   * rounds 10 and 12 (`run-mv5uu9g1-9d80deea`, `run-mv62icw3-9118516f`): a
   * site band narrower than the request's bound dropped two asked rows before
   * the read, and every judge said yes while naming it. Present only in a
   * summary of a run whose trace was in hand.
   */
  narrowedBefore?: AutomationStudioResultNarrowingStep[];
};

/**
 * One step that acted on the page before a read (`AutomationStudioResultReadAccount.narrowedBefore`).
 * `control` is the words of what it pressed or chose, as a model may read them
 * (`../llm/model-facing/control-words.ts`), absent where it names no control
 * or no denied-keys declaration was made. `effect`: `new_page`, it went to
 * another page; `same_page`, it changed the page it stayed on;
 * `already_shown`, its try found the page already showing what it does; absent
 * where the run recorded no comparison of the page before and after it.
 */
export type AutomationStudioResultNarrowingStep = {
  nodeId: string;
  label?: string;
  control?: string;
  effect?: "new_page" | "same_page" | "already_shown";
};
