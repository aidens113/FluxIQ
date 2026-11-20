// `core.loop_decision` as a loop offers it (`./offered.ts`): one decision from the fixed set, and
// what that decision must carry. It observes nothing and changes nothing on the site, so it is
// never a step of the Flow.

import type { AutomationStudioLlmEvidenceTool } from "../evidence-loop/index.ts";
import { AUTOMATION_STUDIO_LLM_LOOP_DECISION_TOOL_ID, AUTOMATION_STUDIO_LLM_LOOP_DECISIONS } from "./tool-id.ts";

const DESCRIPTION = [
  "Decide how to go on after Core has told you (core.loop_check, or a completion refused over the same evidence) that you are repeating yourself. Call it when you are asked to, and only then.",
  "decision is one of: continue (the repeat is deliberate; say why in why, for example that you are waiting for something on the page to change), change_approach (name the different way in approach), ask_person (one plain question for the person in question), escalate_model (hand this attempt to a stronger model), finish_with_best (give the result you have in result, in the shape a completion takes; it is checked as this attempt's result)."
].join(" ");

/** A fresh copy each time, so no loop can change what the next one offers. */
export function automationStudioLlmLoopDecisionTool(): AutomationStudioLlmEvidenceTool {
  return {
    toolId: AUTOMATION_STUDIO_LLM_LOOP_DECISION_TOOL_ID,
    description: DESCRIPTION,
    inputSchema: {
      type: "object",
      properties: {
        decision: { type: "string", enum: [...AUTOMATION_STUDIO_LLM_LOOP_DECISIONS] },
        why: { type: "string", maxLength: 500 },
        approach: { type: "string", maxLength: 500 },
        question: { type: "string", maxLength: 500 },
        result: { type: "object" }
      },
      required: ["decision"],
      additionalProperties: false
    },
    effect: "observe"
  };
}
