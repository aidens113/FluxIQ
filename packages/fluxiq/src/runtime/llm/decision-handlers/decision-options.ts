// The decisions a caught repeat offers right now (`../loop-decision/options.ts`), read off the attempt's record:
// asking the person is a last resort, after a changed approach and a repeat caught again since (t969, restored by
// t1000 without the model-ladder part, which t983 removed with the ladder).

import { automationStudioLlmLoopDecisionOptions, type AutomationStudioLlmLoopDecisionOptions } from "../loop-decision/index.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext } from "./types.ts";

export function automationStudioLlmEvidenceLoopDecisionOptions(context: AutomationStudioLlmEvidenceDecisionHandlerContext): AutomationStudioLlmLoopDecisionOptions {
  const { record } = context.loops;
  const decided = (record.data().decisions ?? []).filter((each) => each.decision === "change_approach").length;
  // A person can be asked only through a caller that takes the signal (t1056: every loop is offered the decision).
  return automationStudioLlmLoopDecisionOptions({ approachesChanged: Math.max(decided, record.approaches), persisting: record.persisting, personReachable: context.input.personReachable ?? context.input.loopSignal !== undefined });
}
