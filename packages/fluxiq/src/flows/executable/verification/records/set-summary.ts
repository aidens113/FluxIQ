import type { ResultProcessingAccount } from "./processing-account.ts";
import type { ResultSortRead } from "./sort-read.ts";
import type { JsonObject } from "@fluxiq/contracts/core";

/** One record set the run stored, as the verification reads it. */

export type ResultRecordSetSummary = {
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
  processing?: ResultProcessingAccount;
  /**
   * How Core read each key of the answer's sort on the rows above
   * (`./value-readings/`, t511): as a date, a number or text, on how many rows,
   * a few rows' readings, and, for the first key, whether the rows are in that
   * order. Absent when the answer has no sort or no row holds a key's column.
   */
  sortRead?: ResultSortRead[];
};
