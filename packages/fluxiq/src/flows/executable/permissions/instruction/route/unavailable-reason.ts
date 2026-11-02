

/** Why no route can be relied on. */
export type AutomationStudioInstructionRouteUnavailableReason =
  /** The read itself failed: nothing came back. */
  | "transport"
  /** An answer came back that was not a completed read. */
  | "non_complete"
  /** The answer gave no route, or one of the wrong shape. */
  | "malformed"
  /** The route's words, or a waypoint's inside them, are not the person's words in the named active instruction. */
  | "ungrounded"
  /** The read could not tell, or the words occur more than once where they must occur once. */
  | "ambiguous"
  /** The instructions changed after the read. */
  | "stale";
