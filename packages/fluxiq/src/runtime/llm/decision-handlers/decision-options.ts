// The decisions a caught repeat offers right now (`../loop-decision/options.ts`), read off the attempt's record:
// asking the person is a last resort, after a changed approach and a climb of the model ladder.

import { automationStudioLlmLoopDecisionOptions, type AutomationStudioLlmLoopDecisionOptions } from "../loop-decision/index.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext } from "./types.ts";

export function automationStudioLlmEvidenceLoopDecisionOptions(context: AutomationStudioLlmEvidenceDecisionHandlerContext): AutomationStudioLlmLoopDecisionOptions {
  const { record } = context.loops;
  const decided = (record.data().decisions ?? []).filter((each) => each.decision === "change_approach").length;
  const { ladder } = record;
  // Nothing to climb (no ladder known, or one rung) counts as at the top: the person is not kept from being asked by a ladder that cannot move.
  const climbedOrAtTop = ladder.level >= 1 || ladder.models === undefined || ladder.models.length < 2;
  return automationStudioLlmLoopDecisionOptions({ approachesChanged: Math.max(decided, record.approaches), climbedOrAtTop });
}
