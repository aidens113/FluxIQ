// Barrel for the executor's step skips: when the run passes over a node rather
// than running or recovering it, because what the node acts on was observed not
// to be there (a sometimes-present popup, banner or consent prompt).
export { automationStudioAbsentStepSkip } from "./absent-step.ts";
