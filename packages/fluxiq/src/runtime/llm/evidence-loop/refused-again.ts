/// A completion refused again over the same draft, the same way, beside the identical part runs it sat between
// (`../evidence-loop.ts`, `unusable`; `../repeat-guard/outcomes.ts`, run-musr9pv3-f4bf6256): whether it ends the round.
//
// No count ends the round (t1014 for the answer-first rounds, t1056 for every loop; user 2026-11-24: "THERE SHOULDNT BE
// ANY ARBITRARY FUCKING CALL LIMIT THAT RANDOMLY JUST RESETS EVERYTHING"). From three refused repeats in a row the same
// completion refused again is a finding on loop detection's ladder, under the completion check's own id as the attempt's
// ladder for a completion refused again names it (`answer-first/loop-signal/completion-refused-again.ts`), steered with
// the model's loop decision. Each further one climbs the ladder; its top rung, raised as any other, ends the round only
// where a caller that takes the signal says so. Any other loop goes on, told what the check refused, until its purse.
//
// A decision refused before it is acted on -- one not offered, one of the wrong shape -- sent again and again the same
// way, with nothing between, is a repeat too, and climbs the same ladder under the decision check's id (t1056). With no
// count ending a loop it was asked again until the purse was gone: a build's model sent a completion it was not offered
// 870 times in a row (`framework/.../deepseek-bootstrap/tests/answerability.test.ts`).
//
// The ladder's two steps are handed in (`caught`, `raise`), so this module imports nothing of the decision handlers and
// closes no import cycle with them.

import type { AutomationStudioLlmEvidenceDecisionHandlerContext } from "../decision-handlers/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_REFUSED_REPEATS_IN_A_ROW, type AutomationStudioLlmLoopFinding, type AutomationStudioLlmLoopSignal, type AutomationStudioLlmLoopSignalAnswer } from "../repeat-guard/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID } from "./completion-check.ts";

type Context = Pick<AutomationStudioLlmEvidenceDecisionHandlerContext, "input" | "loops">;

/** Whether `refusedAgain` repeats refused in a row end the round now. */
export function automationStudioLlmEvidenceRefusedAgainEnds<C extends Context>(context: C, iteration: number, refusedAgain: number, ladder: {
  caught: (context: C, iteration: number, finding: AutomationStudioLlmLoopFinding) => void;
  raise: (context: C, iteration: number, signal: AutomationStudioLlmLoopSignal) => AutomationStudioLlmLoopSignalAnswer;
}, toolId: string = AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID): boolean {
  if (refusedAgain < AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_REFUSED_REPEATS_IN_A_ROW) return false;
  ladder.caught(context, iteration, { pattern: "near_repeat", repeats: refusedAgain, toolIds: [toolId], unchanged: ["draft"] });
  const signal = context.loops.due();
  return signal !== undefined && ladder.raise(context, iteration, signal) !== "continue";
}
