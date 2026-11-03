// Barrel for the executor's step skips: when the run passes over a node rather
// than running or recovering it, because what the node acts on was observed not
// to be there (a sometimes-present popup, banner or consent prompt), and the one
// rule for what an optional step is and where the run goes on past it, and
// whether a step passed over left a lasting act not done; the steps an optional
// step's success runs before its join (its guarded group), and Core's sentence
// for a step a run never ran on some passes (t796).
export { automationStudioAbsentStepSkip } from "./absent-step.ts";
export { automationStudioSkippedStepDoesAct } from "./act-not-done.ts";
export { automationStudioOptionalStepWayOn } from "./optional-step.ts";
export { automationStudioOptionalStepGuardedGroup } from "./guarded-group.ts";
export { automationStudioStepNotRunSaid } from "./not-run-said.ts";
