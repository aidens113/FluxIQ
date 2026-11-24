// The same unreadable decision reply again, as a loop for the deciding role (t1014), exactly as a judge's is (t1000,
// `../../../../result-verification/unreadable-asks/asks.ts`).
//
// **Why.** A loop that takes loop detection's signal (the answer-first rounds) used to end its round on a count of
// unreadable replies in a row (six), and the next round started with an empty evidence window: the model lost what it
// had read and found, and did it again (user, 2026-11-24: "THERE SHOULDNT BE ANY ARBITRARY FUCKING CALL LIMIT THAT
// RANDOMLY JUST RESETS EVERYTHING"). Now no count ends it. Each re-ask names what could not be read and, for a reply off
// the schema, each path and rule it missed (`../../../unusable-decision.ts`); two or more in a row that failed the same
// way (the same `said`, which names the case and those misses) are an `exact_repeat` finding under
// `AUTOMATION_STUDIO_LLM_LOOP_UNREADABLE_DECISION_TOOL_ID`, which the loop puts on loop detection's ladder: steered with
// the model's own loop decision, and only the ladder's last rung reframes the round.
//
// Replies that fail in different ways are no repeat: each is asked again, as one, until the purse ends the task.
// A reply that was read breaks the run.
//
// Closed words only: `said` is Core's clause for the case and the schema's paths and rules, never a word of the reply,
// and it is compared here, never kept on a finding.

import type { AutomationStudioLlmLoopFinding } from "../types.ts";
import { AUTOMATION_STUDIO_LLM_LOOP_UNREADABLE_DECISION_TOOL_ID } from "./tool-id.ts";

/** Unreadable replies in a row, failing the same way, that make a repeat: the judge's figure (t1000). */
const SAME_WAY_AT = 2;

/** One loop's unreadable decision replies, read for a repeat. */
export type AutomationStudioLlmLoopUnreadableRepeat = {
  /** One more unreadable reply, `said` being what could not be read of it: the finding it makes, or nothing. */
  unread(said: string): AutomationStudioLlmLoopFinding | undefined;
  /** A reply was read: the run in a row is broken. */
  readable(): void;
};

export function automationStudioLlmLoopUnreadableRepeat(): AutomationStudioLlmLoopUnreadableRepeat {
  let last: string | undefined;
  let same = 0;
  return {
    unread(said) {
      same = last === said ? same + 1 : 1;
      last = said;
      if (same < SAME_WAY_AT) return undefined;
      return { pattern: "exact_repeat", repeats: same, toolIds: [AUTOMATION_STUDIO_LLM_LOOP_UNREADABLE_DECISION_TOOL_ID], unchanged: ["page", "rows", "acts", "draft"] };
    },
    readable() {
      last = undefined;
      same = 0;
    }
  };
}
