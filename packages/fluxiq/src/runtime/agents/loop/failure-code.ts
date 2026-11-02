export type EvidenceLoopFailureCode =
  | "llm_evidence_loop.invalid_configuration"
  | "llm_evidence_loop.invalid_decision"
  | "llm_evidence_loop.unknown_tool"
  // These two are no longer produced. A reused call id is replaced with one the
  // loop assigns, and a repeated request is answered, a run of them ending the
  // loop as `repeat_without_progress`. Kept because the outcome tables callers
  // key by this union still name them, and a stored result may carry them.
  | "llm_evidence_loop.duplicate_call"
  | "llm_evidence_loop.duplicate_tool_request"
  /** The no-progress guard tripped: the loop kept repeating itself. */
  | "llm_evidence_loop.repeat_without_progress"
  | "llm_evidence_loop.tool_failed"
  /**
   * No longer produced. It was the ending of a loop whose gathered evidence
   * reached a byte backstop, and no loop is ended on bytes any more
   * (`../context-window.ts`). Kept, like the two above, because the outcome
   * tables callers key by this union still name it, and a stored result may
   * carry it.
   */
  | "llm_evidence_loop.evidence_limit"
  /**
   * The loop ran out of turns: iterations, the run's decision budget, or tool
   * calls. **Nothing about what the model produced is being reported here**, and
   * a result carrying this code always carries `exhaustion` saying which
   * allowance ran out and how far the draft had got (`./exhaustion.ts`).
   */
  | "llm_evidence_loop.iteration_limit"
  | "llm_evidence_loop.cancelled"
  /**
   * The provider's replies kept arriving unreadable: an unbroken run of them,
   * each asked again with a note of what could not be read, reached its limit
   * (`../unreadable-reply.ts`). A result carrying this code always carries
   * `unreadable`, saying how many there were and of which kinds.
   */
  | "llm_evidence_loop.unreadable_replies"
  /**
   * The provider stopped answering: an unbroken run of decision calls that got
   * no answer -- timed out, unreachable, a server error, rate limited --
   * reached its limit (`../unanswered-calls.ts`). Nothing was said to the
   * model about them. A result carrying this code always carries
   * `providerUnavailable`.
   */
  | "llm_evidence_loop.provider_unavailable";
