// The parts of a Flow's life a Lab-scoped Flow purse itemises its spend by
// (`./record.ts`, `byPhase`):
//
// - `build`: the creation's own calls -- its exploration, repairs and tests;
// - `read`: the build's reading of its instructions (the step log's `read` phase);
// - `judge`: every judge's call, in a build or a re-author;
// - `runtime`: a run's calls -- in-run repairs, recovery, its result check;
// - `reauthor`: a re-author's build after a run's result was refuted;
// - `chat`: the chat's reading of the message that asked for the build or run.

export const AUTOMATION_STUDIO_FLOW_SPEND_PHASES = Object.freeze(["build", "read", "judge", "runtime", "reauthor", "chat"] as const);
