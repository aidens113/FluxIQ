// One supervisor decision, with its reason: dispatching briefs, triaging a
// return, re-planning, or ending the build. The log is what a later supervisor
// invocation reads to learn why the Flow is the way it is.

export const AUTOMATION_STUDIO_PROJECT_DECISION_KINDS = Object.freeze(["dispatch", "triage", "re_plan", "ending"] as const);
