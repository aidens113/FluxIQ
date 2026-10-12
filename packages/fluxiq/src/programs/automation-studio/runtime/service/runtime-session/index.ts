// Barrel for a run session's lifecycle around its execution: admitting a new
// run (one adaptive run per project), checking the id a caller chose for it,
// and ending a run that threw before it recorded an outcome, so that it neither
// stays active nor blocks the next run; and putting a failed run's recovery
// on the record while it runs, so a reader can tell it working from it dead;
// settling the wait of a parked run that is ended without an answer; and the
// executor options every run gets, which a candidate trial shares; and the
// requirement gate that refuses a run whose graphs need what nothing offers;
// and whether a Router-selected Subflow graph belongs to the Flow being run,
// and binding that Subflow as the run's first frame; and writing a session's
// own files; ending the runs a dead process left `running`; and putting an
// action result that came after Core stopped waiting for it on its run's
// evidence; and supplying an adapting run's in-run repair, the callback the
// executor asks at a true failure, with the ledger of what it fixed, the one
// unit each fix may change, and the graph a run that kept a fix is verified
// against.
export * from "./admission.ts";
export * from "./ending.ts";
export * from "./parked-wait.ts";
export * from "./recovery-state.ts";
export * from "./requested-run-id.ts";
export * from "./terminal-status.ts";
export * from "./parked-expiry.ts";
export * from "./run-input.ts";
export * from "./graph-options.ts";
export * from "./requirement-gate.ts";
export * from "./subflow-graph-ownership.ts";
export * from "./subflow-frame.ts";
export * from "./session-files.ts";
export * from "./orphaned-run-sweep.ts";
export * from "./late-action-result.ts";
export * from "./in-run-repair.ts";
export * from "./in-run-repair-ledger.ts";
export * from "./in-run-repair-unit.ts";
export * from "./held-repair-verification.ts";
