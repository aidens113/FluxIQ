// The decision history as one evidence entry.
//
// Placed beside the window the way the draft and the budget entries are, so it
// never competes for the window's bytes and is never evicted: however long the
// build runs, every decision it made and what Core answered is in front of the
// model. `maxBytes` decides how it is told (`./compression.ts`); a budget too
// small for even the least form gets the least form anyway.
//
// Nothing before the model's first decision: a history of the initial look
// alone would be a row about something the model did not do.

import type { JsonValue } from "../../../../../core/index.ts";
import { automationStudioLlmDecisionContextTellings } from "./compression.ts";
import type { AutomationStudioLlmDecisionContextRecord } from "./decision.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID } from "./history-tool-id.ts";

/**
 * The history entry, or nothing until a decision at iteration 1 or later has
 * been recorded. Its `value` is held to `maxBytes` of JSON, except for the
 * least form, which is given whatever it costs.
 */
export function automationStudioLlmDecisionContextEntry(input: {
  records: readonly AutomationStudioLlmDecisionContextRecord[];
  maxBytes: number;
}): { callId: string; toolId: string; value: JsonValue } | undefined {
  if (!input.records.some((record) => record.iteration >= 1 && record.decision.kind !== "redirect" && record.decision.kind !== "look")) return undefined;
  let chosen: JsonValue | undefined;
  for (const telling of automationStudioLlmDecisionContextTellings(input.records)) {
    chosen = telling.value;
    if (telling.least || Buffer.byteLength(JSON.stringify(telling.value), "utf8") <= input.maxBytes) break;
  }
  return { callId: AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_HISTORY_TOOL_ID, value: chosen! };
}
