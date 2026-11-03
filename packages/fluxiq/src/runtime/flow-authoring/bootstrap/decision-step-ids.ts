// The names a Flow Bootstrap failure record gives the decisions that called no
// tool (`generation-failure.ts`), so a build stopped on refused plans can say,
// decision by decision, what refused each one.

/**
 * The step names of decisions that called no tool. Core's own `core.`
 * namespace, which no domain tool may take, so a reader tells them from tool
 * steps by name. They ride in `steps` rather than in a field of their own so a
 * reader that predates them still parses the record.
 */
export const AUTOMATION_STUDIO_FLOW_BOOTSTRAP_DECISION_STEP_IDS = Object.freeze({
  /** A reply the loop could not act on -- malformed, or a completed plan Core's checks refused -- and asked again after. */
  unusable: "core.decision_unusable",
  /** A completed result the loop accepted. */
  complete: "core.decision_complete",
  /** An edit the model made to the draft it was accruing, rather than a call. */
  amend_draft: "core.decision_amend_draft"
} as const);
