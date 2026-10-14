// Barrel for a project build (automation-project-agents-plan, unit A5c): the
// run that wires the project supervisor and its dispatcher into a real build
// behind authoring mode `project`, its promotion, and the whole candidate's
// trials, which a candidate build shares. Not re-exported from `../index.ts`,
// as `../candidate-trial/` and `../subflow-trial/` are not.
export * from "./types.ts";
export * from "./whole-trials.ts";
export * from "./supervisor-ledger.ts";
export * from "./run.ts";
export * from "./promote.ts";
