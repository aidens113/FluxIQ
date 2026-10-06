// Barrel for record processing: the `process` declaration a record output
// carries, its parser, the value readers it shares with the downstream domain
// and their parity table, and the pure function that turns a dataset's
// collected rows into its answer. `cell-text.ts` is internal and not
// re-exported.
export * from "./condition-holds.ts";
export * from "./parse-condition.ts";
export * from "./parse-processing.ts";
export * from "./process-rows.ts";
export * from "./processing-vocabulary.ts";
export * from "./read-date.ts";
export * from "./read-number.ts";
export * from "./row-identity.ts";
export * from "./sort-rows.ts";
export * from "./sort-value.ts";
export * from "./types.ts";
export * from "./value-reading-cases.ts";
