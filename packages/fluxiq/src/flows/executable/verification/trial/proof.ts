/**
 * What the trial proves of one part: `none` (the part has no typed effect), `shown`, `no_change`, `already_in_end_state`,
 * `carried` (the end state held before, and the same step was seen making it earlier in the build), `unproven`,
 * `contradicted` (a part asking to add, one of whose controls the trial put back to the build's start: t787), which is
 * never a yes, or `not_run` (t796: every step that does the part's lasting act never ran on any pass, a guard routed past
 * it or no pass reached it, so the act was not done whatever the places read; its `notRun` names those steps and why).
 */

export type TrialProof = "none" | "shown" | "no_change" | "already_in_end_state" | "carried" | "unproven" | "contradicted" | "not_run";
