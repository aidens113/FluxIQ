// A decision reply that arrived and could not be read (`../../models/failures/unreadable-reply.ts`): its own count,
// never the no-progress guard's -- the model repeated nothing -- asked again with the same context and a note of what
// could not be read and, off the schema, each path and rule it missed (`../unusable-decision.ts`).
//
// **Two ways to go on.** A loop with no `loopSignal` keeps its count: an unbroken run of them ends the loop as
// `llm_evidence_loop.unreadable_replies`. Where the caller takes loop detection's signal (the answer-first rounds) no
// count ends it (t1014, user 2026-11-24: "THERE SHOULDNT BE ANY ARBITRARY FUCKING CALL LIMIT THAT RANDOMLY JUST RESETS
// EVERYTHING"): the same unreadable reply again is a loop finding for the deciding role
// (`../repeat-guard/loop-detection/unreadable/`), handed to the ladder (`caught`), steered and decided as any repeat
// is, and only the ladder's last rung (`overdue`) ends the round, as a judge's are (t1000).
//
// What the loop records and tells is handed in (`record`, `tell`), so this module reads nothing of the loop's
// decision context and closes no import cycle with it.

import type { JsonObject } from "../../../core/index.ts";
import { automationStudioLlmLoopUnreadableRepeat, type AutomationStudioLlmLoopFinding } from "../repeat-guard/index.ts";
import { automationStudioLlmUnreadableDecisionSaid, automationStudioLlmUnusableDecisionFeedback, type AutomationStudioLlmUnusableDecisionError, type AutomationStudioLlmUnusableDecisionOffers } from "../unusable-decision.ts";
import { automationStudioLlmUnreadableReplies, type AutomationStudioLlmEvidenceLoopUnreadable } from "../../models/failures/index.ts";

/** One loop's unreadable replies: `readable` when a reply was read, `reply` for each that was not. */
export function automationStudioLlmEvidenceUnreadableReplies<Ended, Overdue>(options: {
  /** Whether the caller takes loop detection's signal: then no count ends the loop. */
  loopSignal: boolean;
  /** The count that ends a loop with no signal. */
  maxInARow: number;
  /** Steps without progress, for the note's own figures. None ends the loop (t1049). */
  progress: () => { steps: number };
  /** Records the unreadable decision on the loop's history and trace. */
  record: (iteration: number, thrown: AutomationStudioLlmUnusableDecisionError) => void;
  /** Shows the model the note before it is asked again. */
  tell: (iteration: number, feedback: JsonObject) => void;
  /** The loop's ending once a count of them ends it. */
  ended: (summary: AutomationStudioLlmEvidenceLoopUnreadable) => Ended;
  /** Puts a finding on loop detection's ladder (`../decision-handlers/loop-check.ts`). */
  caught: (iteration: number, finding: AutomationStudioLlmLoopFinding) => void;
  /** The ladder's next step once refusing has not worked: how the round ends, or nothing. */
  overdue: (iteration: number) => Overdue | undefined;
}): {
  readable(): void;
  reply(iteration: number, thrown: AutomationStudioLlmUnusableDecisionError, offers: AutomationStudioLlmUnusableDecisionOffers): "ask_again" | { ended: Ended } | { overdue: Overdue };
} {
  const max = options.loopSignal ? Number.POSITIVE_INFINITY : options.maxInARow;
  const count = automationStudioLlmUnreadableReplies(max);
  const again = automationStudioLlmLoopUnreadableRepeat();
  return {
    readable() {
      count.readable();
      again.readable();
    },
    reply(iteration, thrown, offers) {
      const { issueCodes, reply } = thrown;
      const ended = count.unread(reply?.case ?? issueCodes[0]!);
      options.record(iteration, thrown);
      if (ended) return { ended: options.ended(count.summary()) };
      const progress = options.progress();
      options.tell(iteration, automationStudioLlmUnusableDecisionFeedback({ issueCodes, stepsWithoutProgress: progress.steps, offers, unreadable: { reply, inARow: count.inARow, maxInARow: max } }));
      // The same unreadable reply again: loop detection's, and only its ladder's last rung ends the round.
      const repeat = options.loopSignal ? again.unread(automationStudioLlmUnreadableDecisionSaid(issueCodes, reply)) : undefined;
      if (!repeat) return "ask_again";
      options.caught(iteration, repeat);
      const next = options.overdue(iteration);
      return next === undefined ? "ask_again" : { overdue: next };
    }
  };
}
