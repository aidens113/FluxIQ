// What a steer asks of the model where the loop offers `core.loop_decision` (`./offered.ts`): what
// each repeat came back with, and the decision it must make next. Core's words and codes only; the
// repeat itself is named by the steer's own sentence (`../repeat-guard/loop-detection/feedback.ts`).

import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioLlmLoopCameBack } from "../repeat-guard/index.ts";
import { AUTOMATION_STUDIO_LLM_LOOP_DECISION_TOOL_ID } from "./tool-id.ts";

const INSTRUCTION = `Decide how to go on before anything else: your next decision is a call to ${AUTOMATION_STUDIO_LLM_LOOP_DECISION_TOOL_ID}. cameBack says what each repeat came back with. Choose continue only if repeating is right here, and say why (for example that you are waiting for something on the page to change); change_approach and name the different way; ask_person with one plain question for the person; escalate_model to hand this attempt to a stronger model; or finish_with_best with the result you have, which is checked as this attempt's result.`;

/** The ask a steer carries: what came back each time, and the decision due. */
export function automationStudioLlmLoopDecisionAsk(cameBack: readonly AutomationStudioLlmLoopCameBack[]): JsonObject {
  return {
    tool: AUTOMATION_STUDIO_LLM_LOOP_DECISION_TOOL_ID,
    cameBack: cameBack.map((call) => ({ callId: call.callId, toolId: call.toolId, came: call.came })),
    instruction: INSTRUCTION
  };
}
