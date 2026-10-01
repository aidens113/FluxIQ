// Barrel for a run session's lifecycle around its execution: admitting a new
// run (one adaptive run per project), checking the id a caller chose for it,
// and ending a run that threw before it recorded an outcome, so that it neither
// stays active nor blocks the next run; and putting a failed run's recovery
// on the record while it runs, so a reader can tell it working from it dead;
// and settling the wait of a parked run that is ended without an answer.
export * from "./admission.ts";
export * from "./ending.ts";
export * from "./parked-wait.ts";
export * from "./recovery-state.ts";
export * from "./requested-run-id.ts";
export * from "./terminal-status.ts";
export * from "./parked-expiry.ts";
