// An evidence loop as one part of its attempt (t962): on the attempt's model ladder, and offered the
// model's own decision about a caught repeat.
//
// **The ladder.** The loop runs inside its attempt's ladder frame (`../role-routing/ladder/`), so
// every call it makes -- its decisions and the completion check it asks -- is served on the rung
// the attempt stands on when the call is made, and a climb inside the loop moves the very next
// call. The ladder is the attempt record's, so it holds across the attempt's rounds; a loop given no
// record shares the ladder of the loop it runs inside, if any, so a nested loop never drops back to
// the base rung.
//
// **A repair round that fails climbs.** A round run as a repair (the `repair` role frame,
// `../role-routing/frame.ts`, which an attempt gives a round repairing its saved Flow) that ends
// without the result climbs one rung, unless something in it already climbed: one cause climbs
// one rung. A Stop is no failure of the model's and climbs nothing.
//
// **The decision.** `core.loop_decision` is offered where it can be carried out
// (`../loop-decision/offered.ts`).

import type { AutomationStudioLlmEvidenceLoopResult } from "../evidence-loop/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput } from "../loop-configuration.ts";
import { automationStudioLlmLoopDecisionOffered } from "../loop-decision/index.ts";
import { automationStudioLlmLoopAttemptRecord } from "../repeat-guard/index.ts";
import { automationStudioLlmModelLadderClimb, automationStudioLlmModelLadderFrame, automationStudioLlmModelRoleFrame, runWithAutomationStudioLlmModelLadder, type AutomationStudioLlmModelLadder } from "../role-routing/index.ts";

type Loop = (input: AutomationStudioLlmEvidenceLoopInput) => Promise<AutomationStudioLlmEvidenceLoopResult>;

/** Runs `loop` as part of the attempt `given` belongs to. */
export async function automationStudioLlmEvidenceLoopInAttempt(given: AutomationStudioLlmEvidenceLoopInput, loop: Loop): Promise<AutomationStudioLlmEvidenceLoopResult> {
  const enclosing = automationStudioLlmModelLadderFrame();
  const record = given.attemptRecord ?? automationStudioLlmLoopAttemptRecord(undefined, enclosing ? { ladder: enclosing } : undefined);
  const input = automationStudioLlmLoopDecisionOffered({ ...given, attemptRecord: record });
  const { ladder } = record;
  const repairing = automationStudioLlmModelRoleFrame() === "repair";
  const level = ladder.level;
  const failed = (iteration: number): void => {
    if (repairing && input.signal?.aborted !== true) repairFailed(ladder, level, iteration);
  };
  return await runWithAutomationStudioLlmModelLadder(ladder, async () => {
    let result: AutomationStudioLlmEvidenceLoopResult;
    try {
      result = await loop(input);
    } catch (error) {
      failed(0);
      throw error;
    }
    if (!result.ok) failed(result.trace.at(-1)?.iteration ?? 0);
    return result;
  });
}

function repairFailed(ladder: AutomationStudioLlmModelLadder, levelBefore: number, iteration: number): void {
  if (ladder.level === levelBefore) automationStudioLlmModelLadderClimb(ladder, { reason: "repair_failed" }, iteration);
}
