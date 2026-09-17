// Barrel for a run session's lifecycle around its execution: admitting a new
// run (one adaptive run per project), and ending a run that threw before it
// recorded an outcome, so that it neither stays active nor blocks the next run.
export * from "./admission.ts";
export * from "./ending.ts";
