/**
 * What a task knows of one Flow it saved steps under: the base a proven Flow may be applied onto
 * (`../apply-proven/`). A person's own edits are never replaced, and the digest is how that is told.
 */
export type AutomationStudioAnswerFirstFlowBase = {
  flowId: string;
  /**
   * The Flow's dependency digest the saved steps were last known against: from when it was first
   * saved blank, and again right after this task applied a Flow to it. Absent, the Flow already held
   * someone's work when this task first saved under it, so nothing of this task's is ever applied.
   */
  digest?: string;
  /** What this task last put into the Flow, which a later proven Flow of its own may replace. */
  applied?: { attemptId: string; adaptationId: string; stepsDigest: string; atMs: number };
  /** Since when the Flow has not been this task's to change: its steps stay a draft, and the route still uses them. */
  keptAsDraftSinceMs?: number;
};
