// What a loop does once loop detection's ladder reaches its top rung: refusing has not stopped a run of looks, of
// refused repeats or of refusals of one kind (`../repeat-guard/loop-detection/watch.ts`).
//
// **No count ends the round (t1056; user, 2026-11-24: "THERE SHOULDNT BE ANY ARBITRARY FUCKING CALL LIMIT THAT RANDOMLY
// JUST RESETS EVERYTHING").** The signal is raised and put on the run's record (`./loop-signal.ts`). A caller that takes
// it (`loopSignal`, the answer-first rounds) says whether the round goes on or ends there, as it always has. A loop with
// no such caller goes on: the caller's own move runs where it names one (`recoverStall`, a candidate build's retest of
// its latest revision, `./stall-recovery.ts`), and otherwise the model carries on, steered, and decides how to go on
// (`core.loop_decision`, `./model-decision.ts`). Only its result, its purse, its clock or a person's Stop end it.

import { automationStudioLlmEvidenceLoopRaise } from "./loop-signal.ts";
import { automationStudioLlmEvidenceRepeatStall } from "./repeat-stall.ts";
import { automationStudioLlmEvidenceStallRecovery } from "./stall-recovery.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_REFUSED_CODE, type AutomationStudioLlmLoopSignal } from "../repeat-guard/index.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext } from "./types.ts";
import type { AutomationStudioLlmEvidenceRefusedRepeatNext } from "./refused-repeat.ts";

/**
 * Raises `signal` and answers how the round goes on: nothing while it goes on, the call the caller recovers with
 * where `recoverAt` lets one run, or the stall where a caller ended the round on the signal. `issueCode` is what that
 * stall, or the caller's move, is asked under.
 */
export function automationStudioLlmEvidenceLadderTop(
  context: AutomationStudioLlmEvidenceDecisionHandlerContext,
  iteration: number,
  signal: AutomationStudioLlmLoopSignal,
  issueCode: string | undefined,
  recoverAt?: number
): Extract<AutomationStudioLlmEvidenceRefusedRepeatNext, { kind: "stalled" | "end" | "recover" }> | undefined {
  if (automationStudioLlmEvidenceLoopRaise(context, iteration, signal) !== "continue") return automationStudioLlmEvidenceRepeatStall(context, issueCode, recoverAt);
  if (context.input.loopSignal || recoverAt === undefined) return undefined;
  const moved = automationStudioLlmEvidenceStallRecovery(context, recoverAt, [issueCode ?? AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_REFUSED_CODE]);
  return moved.kind === "recover" ? moved : undefined;
}
