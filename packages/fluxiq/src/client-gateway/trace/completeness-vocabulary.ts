// The closed vocabularies of trace completeness and the recorder's state.
// Frozen and complete, like vocabulary.ts.

/** Why the recorder could not keep a sequence it assigned. */
export const CLIENT_GATEWAY_TRACE_LOSS_REASONS = Object.freeze(["recorder_failure", "buffer_overflow"] as const);

/** Whether a trace's evidence is all there. Missing evidence is never `complete`. */
export const CLIENT_GATEWAY_TRACE_COMPLETENESS_STATUSES = Object.freeze(["open", "complete", "incomplete"] as const);

/** What makes a trace incomplete, each tagged by sequence range or artifact. */
export const CLIENT_GATEWAY_TRACE_ISSUE_CODES = Object.freeze([
  "sequence_gap",
  "sequence_conflict",
  "truncated",
  "foreign_event",
  "undeclared_stream",
  "broken_correlation",
  "missing_artifact",
  "artifact_integrity",
  "incompatible_contract",
  "recorder_failure",
  "buffer_overflow",
  "declared_incomplete"
] as const);

/** The recorder's own state. `failed`: it can no longer persist what it receives. */
export const CLIENT_GATEWAY_TRACE_RECORDER_STATES = Object.freeze(["recording", "failed", "closed"] as const);
