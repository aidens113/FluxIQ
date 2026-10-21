// Why the trace matcher could not answer a command from its trace: the
// evidence gap a classified failure names (traces and offline trials, P4b).
//
// A domain-neutral copy of the reason codes the matcher can produce, spelled
// exactly as the Automation Studio trial evidence vocabulary spells them
// (`programs/automation-studio/model/offline-trial/vocabulary.ts`, U5). The
// gateway never imports a program, so the codes are repeated here rather than
// read from there; a program that maps a gap into its own result contract reads
// the same strings. Frozen and complete: a new reason is a deliberate edit here.
// U5's reasons that only a program gives (a phase, a judge, a source that is
// not live: `offline_not_allowed_in_phase`, `assertion_failure`,
// `judgement_unavailable`, `source_not_live`, ...) are not the matcher's and
// are not copied; the program's drift test pins which those are
// (`programs/automation-studio/runtime/service/offline-trial/tests/gap-vocabulary.test.ts`).
//
// - `missing_transition`: the trace holds no recorded operation for this
//   command at this point (a new operation, one past the recorded end, or any
//   command after an earlier gap);
// - `argument_mismatch`: the next recorded operation is the same action with a
//   different target or parameters;
// - `ambiguous_context`: the trace holds this exact operation, but at another
//   point in the episode (an ordering change), or the trace's operations went
//   to more than one session and none was named;
// - `missing_artifact`: the trace's captured content is not all in the store,
//   or a recorded artifact could not be read back or fed when its point came;
// - `incomplete_capture`: the trace is incomplete, an answer or input it
//   recorded cannot be read back, or a recorded event could not be fed;
// - `incompatible_contract`: the trace was recorded under a contract version
//   this reader does not speak;
// - `redacted_input`: what the command would be compared with, or answered
//   from, was withheld at capture.
export const CLIENT_GATEWAY_TRACE_MATCHER_GAP_REASONS = Object.freeze([
  "missing_transition",
  "argument_mismatch",
  "ambiguous_context",
  "missing_artifact",
  "incomplete_capture",
  "incompatible_contract",
  "redacted_input"
] as const);
