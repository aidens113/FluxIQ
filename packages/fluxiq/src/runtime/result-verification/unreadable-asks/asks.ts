// How one judge's check is asked again while its replies cannot be read (t979).
//
// **Live evidence (F25).** `run-mwoznmcq-cd1d4618`: two of four Haiku judge replies (0047, 0053) came back
// `llm.provider_malformed_response` at HTTP 200: a long diagnosis, sent as JSON text inside `result_json` because the
// judge continued the decider's cached conversation and so took the decider's transport, whose double escaping collapsed
// part-way through. The check had no answer and nothing asked it again. The same happened on a Sonnet judge
// (`run-mwouuc9b`, 0060) and another Haiku judge (`run-mwovplov`, 0307).
//
// **What this keeps for one check.**
//
// 1. Every ask after an unreadable reply carries a short note of what could not be read (`./note.ts`), placed last in
//    what the judge is shown, after any cached prefix.
// 2. A judge continuing the decider's conversation is, after its first unreadable reply, asked on its own request in
//    its own answer format -- the judge's grammar is native (`../../models/providers/anthropic/schema.ts`,
//    `jsonText: false`), so no JSON text is nested at all -- on the same model (`standalone`, sticky for the check).
// 3. Every re-ask stays on the same model (user, 2026-11-20).
//
// No count ends it: the purse, the run's budget and the judge's existing deadline do (user: "it NEEDS to keep retrying
// until final result achieved or budget out"). A readable reply resets the run in a row and is read exactly as a first
// readable reply would be.

/** What one unreadable reply did to how the check is asked next. */
export type AutomationStudioResultUnreadableStep = "asked_again" | "standalone";

/** One check's unreadable replies, and how its next ask is made. */
export type AutomationStudioResultUnreadableAsks = {
  /** One more unreadable reply, `said` being what could not be read. Answers what it changed. */
  unread(said: string): AutomationStudioResultUnreadableStep;
  /** A reply was read: the run in a row is broken, and the next ask carries no note. Standalone stays. */
  readable(): void;
  /** What could not be read of the last reply, while the last reply was unreadable. */
  readonly said: string | undefined;
  /** Unreadable replies in a row. */
  readonly inARow: number;
  /** Every unreadable reply of the check. */
  readonly total: number;
  /** A continuing judge now asked on its own request, in its own answer format, on the same model. */
  readonly standalone: boolean;
};

export function automationStudioResultUnreadableAsks(options: { continuesDecider: boolean }): AutomationStudioResultUnreadableAsks {
  let said: string | undefined;
  let inARow = 0;
  let total = 0;
  let standalone = false;
  return {
    unread(clause) {
      said = clause;
      inARow += 1;
      total += 1;
      if (options.continuesDecider && !standalone) {
        standalone = true;
        return "standalone";
      }
      return "asked_again";
    },
    readable() {
      said = undefined;
      inARow = 0;
    },
    get said() { return said; },
    get inARow() { return inARow; },
    get total() { return total; },
    get standalone() { return standalone; }
  };
}
