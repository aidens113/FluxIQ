// What a steer asks of the model where the loop offers `core.loop_decision` (`./offered.ts`): what
// each repeat came back with, and the decision it must make next. Core's words and codes only; the
// repeat itself is named by the steer's own sentence (`../repeat-guard/loop-detection/feedback.ts`).

import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioLlmLoopCameBack } from "../repeat-guard/index.ts";
import type { AutomationStudioLlmLoopDecisionOptions } from "./options.ts";
import { AUTOMATION_STUDIO_LLM_LOOP_DECISION_TOOL_ID } from "./tool-id.ts";

const CHOICES = {
  continue: "continue only if repeating is right here, and say why (for example that you are waiting for something on the page to change)",
  change_approach: "change_approach and name the different way",
  ask_person: "ask_person with one plain question for the person and in why what is impossible and why",
  finish_with_best: "finish_with_best with the result you have, which is checked as this attempt's result"
} as const;

const IMPOSSIBLE = "Asking the person is only for when the task is genuinely impossible under their instructions, for example something only they can supply or decide; it is not for difficulty or a repeat, and it needs why to name what is impossible and why. Give a solid effort first.";

/** The words the decision is asked in, over what is offered (`./options.ts`). */
function instruction(options: AutomationStudioLlmLoopDecisionOptions): string {
  const choices = options.offered.map((decision) => CHOICES[decision]);
  const list = `${choices.slice(0, -1).join("; ")}; or ${choices.at(-1)}`;
  return `Decide how to go on before anything else: your next decision is a call to ${AUTOMATION_STUDIO_LLM_LOOP_DECISION_TOOL_ID}. cameBack says what each repeat came back with. Choose ${list}. ${IMPOSSIBLE}`;
}

/** The ask a steer carries: what came back each time, the decisions on offer and why, and the decision due. */
export function automationStudioLlmLoopDecisionAsk(cameBack: readonly AutomationStudioLlmLoopCameBack[], options: AutomationStudioLlmLoopDecisionOptions): JsonObject {
  return {
    tool: AUTOMATION_STUDIO_LLM_LOOP_DECISION_TOOL_ID,
    cameBack: cameBack.map((call) => ({ callId: call.callId, toolId: call.toolId, came: call.came })),
    offered: [...options.offered],
    instruction: instruction(options)
  };
}
