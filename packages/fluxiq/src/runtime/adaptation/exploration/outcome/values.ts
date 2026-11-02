/**
 * The only endings there are. An exploration that ended for a reason outside
 * this list is not possible: the runner has one exit and it classifies through
 * these tables.
 */
export const AUTOMATION_STUDIO_EXPLORATION_OUTCOMES = Object.freeze([
  /** It ran, and an action it took returned evidence that the completion used. */
  "evidence_gathered",
  /** It ran to a clean end and produced nothing usable. Not a failure, not a success. */
  "no_evidence_found",
  /** A limit -- time, actions, provider calls, evidence -- stopped it. */
  "budget_exhausted",
  /** It was still allowed to run and had stopped getting anywhere, so it was stopped. */
  "no_progress",
  /** Something it tried to do was refused as unsafe or out of scope. */
  "unsafe_action_blocked",
  /** It cannot proceed without a person. */
  "user_intervention_required",
  /** Something outside the exploration stopped it. Neither a limit nor a fault. */
  "cancelled",
  /** It broke: a malformed decision, an unknown option, a tool that threw. */
  "failed"
] as const);
