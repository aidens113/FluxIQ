// The decision history as one evidence entry.
//
// Placed beside the evidence the way the draft and the budget entries are:
// however long the build runs, every decision it made and what Core answered
// is in front of the model, always in its full form (`./compression.ts`).
//
// Nothing before the model's first decision: a history of the initial look
// alone would be a row about something the model did not do.

import type { JsonValue } from "../../../../../core/index.ts";
import { automationStudioLlmDecisionContextHistoryValue } from "./compression.ts";
import type { AutomationStudioLlmDecisionContextRecord } from "./decision.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID } from "./history-tool-id.ts";

/**
 * The history entry, or nothing until a decision at iteration 1 or later has
 * been recorded. Its `value` is every row, with its full closed detail.
 */
export function automationStudioLlmDecisionContextEntry(input: {
  records: readonly AutomationStudioLlmDecisionContextRecord[];
}): { callId: string; toolId: string; value: JsonValue } | undefined {
  if (!input.records.some((record) => record.iteration >= 1 && record.decision.kind !== "redirect" && record.decision.kind !== "look")) return undefined;
  return { callId: AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID, value: automationStudioLlmDecisionContextHistoryValue(input.records) };
}
