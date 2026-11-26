// Why a project brief's builder stalled: answers it could not use, or usable
// answers that kept being refused, or changing nothing, for one reason (t362).
//
// **Who it serves.** A builder's loop takes the bootstrap's `loopSignal`, so at
// loop detection's ladder top its round ends as a stall
// (`../flow-bootstrap-commands/loop-signal.ts`), and the brief's return to the
// supervisor reads this code (`../project-build/brief-ports.ts`,
// `runtime/project-agents/dispatch/ending.ts`). It was written for candidate
// builds, which since t1063 take no signal and never stall
// (`../flow-bootstrap-commands/candidate-generation.ts`).
//
// **Why.** The loop ends both through one callback (`unusableDecisions.stalled`,
// `runtime/llm/loop-configuration.ts`): a run of replies whose shape was wrong,
// and a run of refusals of one kind (`runtime/llm/decision-handlers/refusal-run.ts`),
// a refused repeat, or a search that found nothing new. Lane A round 4
// (`run-muyrpbnk-fef374e7`) ended on twelve refused submissions -- each a whole,
// readable Flow script -- and the chat said "the model's answer could not be
// used". What tells the two apart is the issue codes the stall carries: a
// reply's shape is refused under `llm_output.*` and a handful of the loop's own
// decision codes; anything else is a usable answer that was refused.

/** The loop's codes for a decision whose shape was wrong rather than one that was refused. */
const REPLY_SHAPE = new Set([
  "llm_evidence_loop.invalid_decision",
  "llm_evidence_loop.decision_shape_invalid",
  "llm_evidence_loop.unknown_tool",
  "llm_evidence_loop.not_offered",
  "llm_evidence_loop.complete_not_offered"
]);

/**
 * The code a builder's stall ends under: an unusable answer when every
 * issue is about a reply's shape (or none is named), otherwise no progress.
 */
export function automationStudioCandidateStallCode(issueCodes: readonly string[]): "flow_bootstrap.evidence_unusable_decision" | "flow_bootstrap.evidence_repeat_without_progress" {
  const shapeOnly = issueCodes.every((code) => code.startsWith("llm_output.") || REPLY_SHAPE.has(code));
  return shapeOnly ? "flow_bootstrap.evidence_unusable_decision" : "flow_bootstrap.evidence_repeat_without_progress";
}
