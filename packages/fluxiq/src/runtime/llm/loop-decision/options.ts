// Recovery choices are independent of model escalation. Asking still requires the reader's
// explanation of genuine impossibility; difficulty alone is not a reason to ask.
import { AUTOMATION_STUDIO_LLM_LOOP_DECISIONS, type AutomationStudioLlmLoopDecisionKind } from "./tool-id.ts";

export type AutomationStudioLlmLoopDecisionFacts = {
  approachesChanged: number;
  /** Historical caller field, ignored. */
  climbedOrAtTop?: boolean;
};

export type AutomationStudioLlmLoopDecisionOptions = {
  offered: readonly AutomationStudioLlmLoopDecisionKind[];
  askPerson: "offered";
  approachesChanged: number;
};

export function automationStudioLlmLoopDecisionOptions(facts: AutomationStudioLlmLoopDecisionFacts): AutomationStudioLlmLoopDecisionOptions {
  return { offered: [...AUTOMATION_STUDIO_LLM_LOOP_DECISIONS], askPerson: "offered", approachesChanged: facts.approachesChanged };
}
