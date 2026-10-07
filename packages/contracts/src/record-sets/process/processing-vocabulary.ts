// The words a record output's `process` may use, and its bounds. The condition
// vocabulary is the downstream web domain's item condition in its `field` form,
// to the key, so a condition a domain moves from read time to run end means the
// same thing in both places.

/** Bounds `parseAutomationStudioRecordProcessing` enforces. A declaration that exceeds them is refused, not trimmed. */
export const AUTOMATION_STUDIO_RECORD_PROCESSING_LIMITS = Object.freeze({
  /** Keys one `sort` may name. */
  maxSortKeys: 4,
  /** The highest `limit` a declaration may set; the lowest is 1. */
  limitCeiling: 10_000,
  /** Rows an answer is expected to hold when `minRows` is absent. Reported, never a failure. */
  minRowsDefault: 1
});

/** Which way a sort key runs. */
export const AUTOMATION_STUDIO_RECORD_SORT_ORDERS = Object.freeze(["asc", "desc"] as const);

/** What a sort key's values are read as; `auto`, which an absent `as` means, picks per column. */
export const AUTOMATION_STUDIO_RECORD_SORT_TYPES = Object.freeze(["auto", "number", "date", "text"] as const);

/** Whether a condition requires its value or its absence. */
export const AUTOMATION_STUDIO_RECORD_CONDITION_PRESENCES = Object.freeze(["present", "absent"] as const);

/** The comparisons a condition may put on the number in its value. */
export const AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS = Object.freeze(["atLeast", "atMost", "lessThan", "greaterThan"] as const);

/** The comparisons a condition may put on the text of its value. */
export const AUTOMATION_STUDIO_RECORD_CONDITION_TEXTS = Object.freeze(["matches", "contains", "startsWith", "endsWith"] as const);
