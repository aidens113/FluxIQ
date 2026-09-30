// The model's stated reason for one decision, kept beside the decision and
// never inside it.
//
// Every evidence-tool decision arrives with a required `summary`: the model's
// own sentence for what it does next, on what, and why. The loop must not see
// it. Its grammar refuses a decision carrying a key it does not know, and what
// the model is shown next is built from the decision the loop parsed, so a
// reason put on the decision would either refuse it or travel into the next
// context. Instead the reason is held against the very object `decide`
// returns, in a WeakMap: the observer (`observer.ts`) reads it as `decide`
// returns and says it in the chat, nothing that copies or parses the decision
// carries it on, and the entry goes when the decision does.

const reasons = new WeakMap<object, string>();

export const automationStudioActivityDecisionReason = Object.freeze({
  /** Keeps `reason` beside `decision` and returns `decision` itself, unchanged. */
  attach<T extends object>(decision: T, reason: unknown): T {
    if (typeof reason === "string" && reason.trim()) reasons.set(decision, reason);
    return decision;
  },
  /** The reason kept beside this exact decision object, if any. */
  of(decision: unknown): string | undefined {
    return decision !== null && typeof decision === "object" ? reasons.get(decision) : undefined;
  }
});
