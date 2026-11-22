// The decisions a caught repeat offers right now (`../loop-decision/options.ts`), read off the attempt's record:
// model changes never gate the person-question route.

import { automationStudioLlmLoopDecisionOptions, type AutomationStudioLlmLoopDecisionOptions } from "../loop-decision/index.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext } from "./types.ts";

export function automationStudioLlmEvidenceLoopDecisionOptions(context: AutomationStudioLlmEvidenceDecisionHandlerContext): AutomationStudioLlmLoopDecisionOptions {
  const { record } = context.loops;
  const decided = (record.data().decisions ?? []).filter((each) => each.decision === "change_approach").length;
  return automationStudioLlmLoopDecisionOptions({ approachesChanged: Math.max(decided, record.approaches) });
}
