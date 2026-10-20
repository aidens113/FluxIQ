// Client gateway trace replay (traces and offline trials, P3): a stored trace
// replayed through Core's own gateway intake, and the parity report comparing
// what the replay's gateway received and derived with the recording, at every
// delivery point. Exported from `client-gateway/index.ts` only.
export type * from "./types.ts";
export * from "./parity-classes.ts";
export * from "./session-references/index.ts";
export * from "./walk/index.ts";
export * from "./comparison/index.ts";
export * from "./replay-trace.ts";
