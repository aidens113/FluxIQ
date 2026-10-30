// The words a record output's `process` may use, and its bounds. The condition
// vocabulary is the downstream web domain's item condition in its `field` form,
// to the key, so a condition a domain moves from read time to run end means the
// same thing in both places.
//
// **A bound may be a date (t790).** Run `run-mvswewhy-e4e469d4` was asked for
// rows "on or after Saturday 19 September 2026" and, with bounds that read only
// numbers, wrote `posted matches "(19|20|21) September 2026"`, which drops every
// row dated 22 September or later. A bound written as a date (text) compares
// the date the value states, and `as: "date"` says so.
//
// **And relative to the run (t800, K1).** A date bound may be written as
// `today`, `yesterday`, `now` or `<n> <unit> ago`, and `within: "<n> <unit>"`
// keeps the rows dated in the last `n` units up to the run's `now`
// (`date-bound.ts`, `date-within.ts`).

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

/** The comparisons a condition may put on the number in its value, or, written as a date, on the date it states (t790). */
export const AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS = Object.freeze(["atLeast", "atMost", "lessThan", "greaterThan"] as const);

/** The comparisons a condition may put on the text of its value. */
export const AUTOMATION_STUDIO_RECORD_CONDITION_TEXTS = Object.freeze(["matches", "contains", "startsWith", "endsWith"] as const);

/**
 * The units a `within` names (t800, K1): `{field, within: "7 days"}` keeps the
 * rows whose value states a date from 7 days before the run's `now` up to it.
 * Singular or plural, one whole number of one unit. Months and years are not
 * units here: neither is one fixed length of time.
 */
export const AUTOMATION_STUDIO_RECORD_CONDITION_WITHIN_UNITS = Object.freeze(["minutes", "hours", "days", "weeks"] as const);

/** Milliseconds in one of each `within` unit, by its singular. */
export const AUTOMATION_STUDIO_RECORD_CONDITION_UNIT_MS = Object.freeze({ minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000 } as const);

/**
 * The words a date bound may be written in relative to the run's `now` (t800,
 * K1), besides `<n> <unit> ago` in a `within` unit: `today` and `yesterday`
 * name their whole day, `now` the instant (`date-bound.ts`).
 */
export const AUTOMATION_STUDIO_RECORD_CONDITION_RELATIVE_DAYS = Object.freeze(["today", "yesterday", "now"] as const);

/** What a condition's bounds compare (t790): the number the value states, or the date; a bound written as text is always a date. */
export const AUTOMATION_STUDIO_RECORD_CONDITION_TYPES = Object.freeze(["number", "date"] as const);
