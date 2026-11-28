// `core.loop_decision` as a loop offers it (`./offered.ts`): one decision from the fixed set, and
// what that decision must carry. It observes nothing and changes nothing on the site, so it is
// never a step of the Flow.

import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioLlmEvidenceTool } from "../evidence-loop/index.ts";
import { AUTOMATION_STUDIO_LLM_LOOP_DECISION_TOOL_ID, AUTOMATION_STUDIO_LLM_LOOP_DECISIONS } from "./tool-id.ts";

const DESCRIPTION = [
  "Decide how to go on after Core has told you (core.loop_check, or a completion refused over the same evidence) that you are repeating yourself. Call it when you are asked to, and only then. The ask names which decisions are on offer: ask_person is a last resort, offered only once you have changed approach and the repeat still comes back, and only for a task that is genuinely impossible under the person's instructions: it needs question and why (what is impossible, and why).",
  "decision is one of: continue (the repeat is deliberate; say why in why, for example that you are waiting for something on the page to change), change_approach (name the different way in approach), ask_person (one plain question for the person in question), finish_with_best (give the result you have in result, in the shape a completion takes; it is checked as this attempt's result, and if the check does not accept it, the repeat stays refused and you work on what the check named)."
].join(" ");

/** A fresh copy each time, so no loop can change what the next one offers. */
/**
 * `resultSchema` is the schema of the result a completion carries, which a `finish_with_best` result is checked against as
 * the attempt's result; given, `result` is that schema rather than an open object, so the tool's input is as closed as the
 * completion's own and a provider may take it as strict (t1096). Omitted, `result` stays an open object.
 */
export function automationStudioLlmLoopDecisionTool(resultSchema?: JsonObject): AutomationStudioLlmEvidenceTool {
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
        result: resultSchema ? structuredClone(resultSchema) : { type: "object" }
      },
      required: ["decision"],
      additionalProperties: false
    },
    effect: "observe"
  };
}
