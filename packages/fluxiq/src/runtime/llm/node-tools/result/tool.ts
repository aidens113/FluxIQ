// `core.set_result_processing` as a loop offers it (t970): the Flow's result
// processing, set or changed at any point, apart from the Flow's steps.
//
// It observes nothing and changes nothing on the target, so it is never a step:
// what it sets is held on the draft (`../../../flow-authoring/draft/result-processing/held.ts`)
// and written onto the Flow's record outputs as it is assembled, and its answer
// is the result as the processing makes it from the rows already read
// (`./answer.ts`). Its words name rows and columns, never a page, a site or a
// task: the guidance a model is given never mirrors a scenario (AGENTS.md).

import type { AutomationStudioLlmEvidenceTool } from "../../evidence-loop/index.ts";
import { AUTOMATION_STUDIO_LLM_SET_RESULT_PROCESSING_TOOL_ID } from "./tool-id.ts";

const DESCRIPTION = [
  "Set what is done to the result's rows after they are read: which rows are kept, their order, how many, and which columns the answer shows.",
  "It runs on the rows already read, touches no page, needs no step and no re-read, can be changed at any time, and every later run of the Flow applies it with no model call.",
  "Use it when each row states what decides it (a value, a mark, a badge, a label): read that as a column, even one the answer must not show, and filter here; a column only filtered by stays out of the answer when columns names the ones to show.",
  "process: where (every condition holds: is present or absent; atLeast, atMost, lessThan, greaterThan or equals on the number a value states, or on a date written as text with as: date; contains, startsWith, endsWith, matches; not), anyOf (groups of conditions, a row kept when any one in each group holds), compare (two columns of a row: {field, lessThan: otherField}), derive (a column from part of another: {id, from, pattern, as: number|date|text}), dedupe {by}, sort [{field, order}], limit, columns.",
  "The answer shows the rows kept and, per condition, the rows it left out; check them against the request. clear: true removes it.",
  "Rows a later step acts on are still narrowed by that read's where."
].join(" ");

/** A fresh copy each time, so no loop can change what the next one offers. */
export function automationStudioLlmSetResultProcessingTool(): AutomationStudioLlmEvidenceTool {
  return {
    toolId: AUTOMATION_STUDIO_LLM_SET_RESULT_PROCESSING_TOOL_ID,
    description: DESCRIPTION,
    inputSchema: {
      type: "object",
      properties: {
        process: { type: "object", description: "The whole declaration; it replaces the one held." },
        clear: { type: "boolean", description: "true removes the declaration held, in place of process." },
        dataset: { type: "string", maxLength: 200, description: "The list it shapes, when the result is not the one meant; absent, the result." },
        why: { type: "string", maxLength: 500 }
      },
      additionalProperties: false
    },
    effect: "observe"
  };
}
