// One record set a run stored, as the verification reads it, and each key of
// its answer's sort as Core read it (t511, `./value-readings/sort-reading.ts`).
// Kept apart from `./contracts.ts`, which re-exports both.

import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioResultProcessingAccount } from "./processing-account.ts";

/** One record set the run stored, as the verification reads it. */
export type AutomationStudioResultRecordSetSummary = {
  datasetId: string;
  label?: string;
  /** Rows stored. Zero is the finding that produced this module. */
  recordCount: number;
  /** Rows the record schema refused. Every row refused leaves `recordCount` zero. */
  refusedCount: number;
  /** True when the run returned more rows than the record output keeps. */
  truncated: boolean;
  /** The stored schema's field ids, in schema order, bounded by `maxColumns`. */
  columns: string[];
  /** True when the column list was cut. */
  columnsWithheld: boolean;
  /**
   * Stored rows Core read back for its own required-value check: at most
   * `maxRowsCheckedPerSet`, so fewer than `recordCount` on a large set, and 0
   * when the set's rows or its schema could not be read.
   */
  rowsChecked: number;
  /** Of `rowsChecked`, the rows carrying no value for a field the set's own schema declares required. */
  rowsMissingRequired: number;
  /** The required field ids some checked row lacked, in schema order, bounded by `maxColumns`. Ids, never values. */
  missingRequiredColumns: string[];
  /** A few stored rows, each value bounded. Absent when the set stored none. */
  sampleRows?: JsonObject[];
  /**
   * What the run's end made of the rows the set collected (read-list design
   * 5.2): the rows above are its answer, and this says how many were
   * collected, how many repeated an earlier row, were left out by a condition
   * over stored columns or past its limit, and each pass's rows, and per
   * condition the rows it alone left out (`processing-account.ts`, t493).
   */
  processing?: AutomationStudioResultProcessingAccount;
  /**
   * How Core read each key of the answer's sort on the rows above
   * (`./value-readings/`, t511): as a date, a number or text, on how many rows,
   * a few rows' readings, and, for the first key, whether the rows are in that
   * order. Absent when the answer has no sort or no row holds a key's column.
   */
  sortRead?: AutomationStudioResultSortRead[];
};

/** One sort key of a record set's answer as Core read it (`./value-readings/sort-reading.ts`, t511). */
export type AutomationStudioResultSortRead = {
  /** The stored column the key sorts by. */
  field: string;
  /** For the first key only: whether the rows shown are in the key's order as Core read it. */
  inOrder?: boolean;
  /** Core's sentence: the order, what the column was read as and on how many rows, and a few readings. */
  said: string;
};
