// How long one project build may take, whole (automation-project-agents-plan;
// t592). Every loop of a build was bounded -- a candidate build's exploration
// at nine minutes (`./flow-bootstrap-evidence-loop.ts`) -- but nothing bounded
// a project build, which runs a supervisor and several builders, their subflow
// trials and resets, and whole trials. The Lab's chat waited a candidate
// build's ten minutes and lost three of four project builds of A8 launch 7 to
// it while they were still working (social `run-mv8cam5t-436efa46` had passed
// its whole test and was adding a rate-limit branch).
//
// The clock starts when the supervisor's run starts, before it reads the build
// record, and everything the run does counts: its decisions, every builder it
// dispatches with their subflow trials and resets, the whole trials and their
// judges, and Core's own reset and the recorded ending. What its caller does
// around it -- taking the generation lock before, saving the draft after --
// does not, and neither does the chat around a build; a reader that waits for a
// build adds its own steps to this (the Lab's chat deadline does).
// `project-agents/supervisor/supervisor-loop.ts` enforces it.

/** The most one project build may take: thirty minutes. */
export const AUTOMATION_STUDIO_PROJECT_BUILD_MAX_DURATION_MS = 1_800_000;
