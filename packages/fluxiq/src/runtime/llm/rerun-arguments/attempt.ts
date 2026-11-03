/** Current execution identity; a pre-execution refusal has no performed call. */
export type AutomationStudioRerunAttempt =
  | { kind: "accepted" | "failed"; callId: string }
  | { kind: "refused"; reason: "rerun_holds_binding" };
