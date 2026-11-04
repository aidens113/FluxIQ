// The attempt's `loopsCaught`: what each round's rows say, summed across rounds (plan D14).
//
// A tally leaves the loop only as its trace rows (`automationStudioLlmLoopsCaught`), and a round
// ends with them in hand whether it returned or stalled. A round whose decision threw out of the
// loop keeps no rows, so what it steered or refused is not counted; its signals cannot be lost
// that way, since a signal is what ends a round as a stall, which keeps them.
//
// **`same_act` has no slot in the contract's five patterns**, and is counted under `exact_repeat`:
// it is the same call again, which is the nearest thing the five name. The number there means
// "the same call again", the failed kind and the landed kind together. The contract cannot be
// changed from this lane, so this is the one place to change when it gains the slot.

import type { AutomationStudioTaskAttemptLoopPattern, AutomationStudioTaskAttemptLoopsCaught } from "@fluxiq/contracts/automation";
import { automationStudioLlmLoopsCaught, type AutomationStudioLlmLoopPattern } from "../../../../../runtime/llm/repeat-guard/index.ts";

/** The contract's name for a loop pattern (header). */
export function automationStudioAnswerFirstLoopPattern(pattern: AutomationStudioLlmLoopPattern): AutomationStudioTaskAttemptLoopPattern {
  return pattern === "same_act" ? "exact_repeat" : pattern;
}

/** Adds one round's rows to the attempt's counts, in place. */
export function automationStudioAnswerFirstAddLoopsCaught(total: AutomationStudioTaskAttemptLoopsCaught, rows: Parameters<typeof automationStudioLlmLoopsCaught>[0]): void {
  const round = automationStudioLlmLoopsCaught(rows);
  for (const pattern of Object.keys(round) as AutomationStudioLlmLoopPattern[]) {
    const into = total[automationStudioAnswerFirstLoopPattern(pattern)];
    into.steered += round[pattern].steered;
    into.refused += round[pattern].refused;
    into.changeApproach += round[pattern].changeApproach;
    into.askPerson += round[pattern].askPerson;
  }
}
