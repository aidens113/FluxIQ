// `core.recall_result` as the loop offers it: one callId in, nothing changed.

import type { AutomationStudioLlmEvidenceTool } from "../evidence-loop/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_DESCRIPTION } from "./description.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID } from "./tool-id.ts";

/** A fresh copy each time, so no loop can change what the next one offers. */
export function automationStudioLlmEvidenceRecallTool(): AutomationStudioLlmEvidenceTool {
  return {
    toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID,
    description: AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_DESCRIPTION,
    inputSchema: {
      type: "object",
      properties: { callId: { type: "string", minLength: 1, maxLength: 200 } },
      required: ["callId"],
      additionalProperties: false
    },
    effect: "observe"
  };
}
