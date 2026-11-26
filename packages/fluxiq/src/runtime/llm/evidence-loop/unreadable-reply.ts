// A decision reply that arrived and could not be read (`../../models/failures/unreadable-reply.ts`): its own count,
// never the no-progress guard's -- the model repeated nothing -- asked again on the same model with the same context and
// a note of what could not be read and, off the schema, each path and rule it missed (`../unusable-decision.ts`). Each
// one is a paid call, held against the purse like any decision.
//
// **No count of them ends a loop (t1014 for the answer-first rounds, t1056 for every loop; user 2026-11-24: "THERE
// SHOULDNT BE ANY ARBITRARY FUCKING CALL LIMIT THAT RANDOMLY JUST RESETS EVERYTHING").** An unbroken run of them used to
// end a loop with no `loopSignal` as `llm_evidence_loop.unreadable_replies`. Now the same unreadable reply again is a
// loop finding (`../repeat-guard/loop-detection/unreadable/`), handed to the ladder (`caught`), steered and decided as
// any repeat is, and the ladder's top rung (`overdue`) ends the round only where a caller that takes the signal says so,
// as a judge's are (t1000). A loop that cannot get a readable reply ends when its purse does.
//
// What the loop records and tells is handed in (`record`, `tell`), so this module reads nothing of the loop's
// decision context and closes no import cycle with it.

import type { JsonObject } from "../../../core/index.ts";
import { automationStudioLlmLoopUnreadableRepeat, type AutomationStudioLlmLoopFinding } from "../repeat-guard/index.ts";
import { automationStudioLlmUnreadableDecisionSaid, automationStudioLlmUnusableDecisionFeedback, type AutomationStudioLlmUnusableDecisionError, type AutomationStudioLlmUnusableDecisionOffers } from "../unusable-decision.ts";
import { automationStudioLlmUnreadableReplies, type AutomationStudioLlmEvidenceLoopUnreadable } from "../../models/failures/index.ts";

/** One loop's unreadable replies: `readable` when a reply was read, `reply` for each that was not. */
export function automationStudioLlmEvidenceUnreadableReplies<Overdue>(options: {
  /** Records the unreadable decision on the loop's history and trace. */
  record: (iteration: number, thrown: AutomationStudioLlmUnusableDecisionError) => void;
  /** Shows the model the note before it is asked again. */
  tell: (iteration: number, feedback: JsonObject) => void;
  /** Puts a finding on loop detection's ladder (`../decision-handlers/loop-check.ts`). */
  caught: (iteration: number, finding: AutomationStudioLlmLoopFinding) => void;
  /** The ladder's next step once refusing has not worked: how the round goes on or ends, or nothing. */
  overdue: (iteration: number) => Overdue | undefined;
}): {
  readable(): void;
  reply(iteration: number, thrown: AutomationStudioLlmUnusableDecisionError, offers: AutomationStudioLlmUnusableDecisionOffers): "ask_again" | { overdue: Overdue };
  /** The unbroken run the loop is in, with every unreadable reply of it, while its latest reply was unreadable; else nothing. */
  streak(): AutomationStudioLlmEvidenceLoopUnreadable | undefined;
} {
  // Counted for the note alone: it never reaches an end.
  const count = automationStudioLlmUnreadableReplies(Number.POSITIVE_INFINITY);
  const again = automationStudioLlmLoopUnreadableRepeat();
  return {
    readable() {
      count.readable();
      again.readable();
    },
    streak() {
      return count.inARow > 0 ? count.summary() : undefined;
    },
    reply(iteration, thrown, offers) {
      const { issueCodes, reply } = thrown;
      count.unread(reply?.case ?? issueCodes[0]!);
      options.record(iteration, thrown);
      options.tell(iteration, automationStudioLlmUnusableDecisionFeedback({ issueCodes, stepsWithoutProgress: 0, offers, unreadable: { reply, inARow: count.inARow } }));
      // The same unreadable reply again: loop detection's, and only its ladder's top rung can end the round.
      const repeat = again.unread(automationStudioLlmUnreadableDecisionSaid(issueCodes, reply));
      if (!repeat) return "ask_again";
      options.caught(iteration, repeat);
      const next = options.overdue(iteration);
      return next === undefined ? "ask_again" : { overdue: next };
    }
  };
}
