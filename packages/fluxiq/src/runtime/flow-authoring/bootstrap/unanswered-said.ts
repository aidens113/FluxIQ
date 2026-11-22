// The line a build says, once, naming the acts the instruction's read gave no answer for, and what
// its tests do about them (`./action-permissions.ts`, t174-w107). Moved here from the gate's file
// with t976, unchanged.

/** How much of each unanswered act's words the thread is shown. */
const UNANSWERED_QUOTE_MAX = 120;

/**
 * The line naming the acts the read gave no answer for. A long quote is cut
 * where a word ends: cut at 119 characters it read "...the 7-in-1 version,
 * shipped f..." (W25, run-mux6n7m4-8273e7a0).
 */
export function automationStudioFlowBootstrapUnansweredSaid(quotes: readonly string[]): string {
  const named = quotes.map((quote) => `"${quoteCut(quote)}"`).join(", ");
  const one = quotes.length === 1;
  return `I could not tell from your instruction whether ${named} ${one ? "changes" : "change"} something that stays changed, so when the build tests its steps it checks ${one ? "the step that does it" : "the steps that do them"} rather than doing ${one ? "it" : "them"} again.`;
}

/** `quote` within `UNANSWERED_QUOTE_MAX`, cut after its last whole word with an ellipsis; one word longer than that is cut where it must. */
function quoteCut(quote: string): string {
  if (quote.length <= UNANSWERED_QUOTE_MAX) return quote;
  const kept = quote.slice(0, UNANSWERED_QUOTE_MAX - 1);
  const space = quote.charAt(UNANSWERED_QUOTE_MAX - 1) === " " ? UNANSWERED_QUOTE_MAX - 1 : kept.lastIndexOf(" ");
  const cut = space > 0 ? kept.slice(0, space) : kept;
  return `${cut.trimEnd().replace(/[,;:]+$/u, "")}…`;
}

/**
 * Says, once, which of the person's acts the instruction's read gave no answer
 * for, and what the build does about it. A plain line, never a question: the
 * build carries on and loses nothing by it. Best-effort, like every line the
 * gate says; the read's own step record keeps the answer it gave either way.
 */
export async function automationStudioFlowBootstrapSaidUnanswered(say: ((text: string) => Promise<unknown>) | undefined, quotes: readonly string[]): Promise<void> {
  if (!say) return;
  try {
    await say(automationStudioFlowBootstrapUnansweredSaid(quotes));
  } catch {
    /* best-effort: a thread that could not be written to changes nothing the build does. */
  }
}
