// The attempt's `loopsCaught`: what each round's rows say, summed across rounds (plan D14).
//
// A tally leaves the loop only as its trace rows (`automationStudioLlmLoopsCaught`), and a round
// ends with them in hand whether it returned or stalled. A round whose decision threw out of the
// loop keeps no rows, so what it steered or refused is not counted; its signals cannot be lost
// that way, since a signal is what ends a round as a stall, which keeps them.
//
// `same_act` has its own slot in the contract's patterns, so each pattern is counted under its own name.

import type { AutomationStudioTaskAttemptLoopPattern, AutomationStudioTaskAttemptLoopsCaught } from "@fluxiq/contracts/automation";
import { automationStudioLlmLoopsCaught, type AutomationStudioLlmLoopPattern } from "../../../../../runtime/llm/repeat-guard/index.ts";

/** The contract's name for a loop pattern (header). */
export function automationStudioAnswerFirstLoopPattern(pattern: AutomationStudioLlmLoopPattern): AutomationStudioTaskAttemptLoopPattern {
  return pattern;
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
