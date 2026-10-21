// The operation an action command makes, as the trace matcher reads and
// compares it (traces and offline trials, P4b): which fields are compared and
// why the rest are left out, the canonical reading, where two operations
// differ, and strict matching at the cursor.
export * from "./fields.ts";
export * from "./read.ts";
export * from "./differences.ts";
export * from "./match.ts";
