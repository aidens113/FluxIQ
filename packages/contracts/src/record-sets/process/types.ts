import type {
  AUTOMATION_STUDIO_RECORD_CONDITION_PRESENCES,
  AUTOMATION_STUDIO_RECORD_SORT_ORDERS,
  AUTOMATION_STUDIO_RECORD_SORT_TYPES
} from "./processing-vocabulary.ts";

/** One thing a condition's value may equal: a number, against the number the value states, or a string, against its text. */
export type AutomationStudioRecordConditionValue = string | number;

/**
 * Whether one stored column of a row holds what a `where` asks. Every
 * comparison named must hold, a list means any of its entries, and `not`
 * inverts the whole verdict, a missing value included. A condition naming no
 * comparison asks whether the value is there (`is`, default `present`).
 * `is: "absent"` beside a comparison is refused.
 */
export type AutomationStudioRecordCondition = {
  /** A stored field id of the schema. */
  field: string;
  is?: (typeof AUTOMATION_STUDIO_RECORD_CONDITION_PRESENCES)[number];
  atLeast?: number;
  atMost?: number;
  lessThan?: number;
  greaterThan?: number;
  equals?: AutomationStudioRecordConditionValue | AutomationStudioRecordConditionValue[];
  /** A regular expression; a bare source ignores case, `/source/flags` says what its flags say. */
  matches?: string | string[];
  contains?: string | string[];
  startsWith?: string | string[];
  endsWith?: string | string[];
  not?: boolean;
};

export type AutomationStudioRecordSortOrder = (typeof AUTOMATION_STUDIO_RECORD_SORT_ORDERS)[number];

export type AutomationStudioRecordSortType = (typeof AUTOMATION_STUDIO_RECORD_SORT_TYPES)[number];

/** One key of a `sort`. A row whose value cannot be read as the key's type goes after every row that can, in either direction. */
export type AutomationStudioRecordSortKey = {
  field: string;
  order: AutomationStudioRecordSortOrder;
  as?: AutomationStudioRecordSortType;
};

/** The stored field ids whose values together identify a row. */
export type AutomationStudioRecordDedupe = { by: string[] };

/**
 * How a dataset's collected rows become its answer at run end, applied in this
 * order: `where`, `dedupe`, `sort`, `limit`, `columns`. Every field id named is
 * a stored field of the record output's schema.
 */
export type AutomationStudioRecordProcessing = {
  /** Absent: the whole row is the key (the answer's columns when `columns` is set). `false`: no dedupe. */
  dedupe?: AutomationStudioRecordDedupe | false;
  where?: AutomationStudioRecordCondition[];
  sort?: AutomationStudioRecordSortKey[];
  /** 1 to `limitCeiling`. */
  limit?: number;
  /** The stored columns the answer keeps, in this order. Each listed once; every `where` field among them. */
  columns?: string[];
  /** Rows the answer is expected to hold; `minRowsDefault` when absent. Reported, never a failure. */
  minRows?: number;
};

/** One batch of collected rows: a pass of one node. */
export type AutomationStudioRecordProcessingPass = {
  node: string;
  /** 1-based, per node, in the order the node's batches first appear. */
  pass: number;
  rows: number;
  /** This batch's rows that do not repeat an earlier collected row under the dedupe identity. */
  newRows: number;
};

/**
 * What processing did to one dataset, in counts. `collected` is
 * `filteredOut + duplicates + cut + kept`.
 */
export type AutomationStudioRecordProcessingAccount = {
  collected: number;
  duplicates: number;
  filteredOut: number;
  cut: number;
  kept: number;
  /** Present when the answer holds no rows. */
  keptNone?: true;
  /** The `minRows` the answer fell short of, when it did. */
  belowMinRows?: number;
  passes: AutomationStudioRecordProcessingPass[];
};
