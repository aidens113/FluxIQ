// `core.full_page` as the loop offers it: an optional part number in, nothing changed.

import type { AutomationStudioLlmEvidenceTool } from "../evidence-loop/index.ts";
import { AUTOMATION_STUDIO_LLM_FULL_PAGE_DESCRIPTION } from "./description.ts";
import { AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID } from "./tool-id.ts";

/** A fresh copy each time, so no loop can change what the next one offers. */
export function automationStudioLlmFullPageTool(): AutomationStudioLlmEvidenceTool {
  return {
    toolId: AUTOMATION_STUDIO_LLM_FULL_PAGE_TOOL_ID,
    description: AUTOMATION_STUDIO_LLM_FULL_PAGE_DESCRIPTION,
    inputSchema: {
      type: "object",
      properties: { part: { type: "integer", minimum: 1 } },
      additionalProperties: false
    },
    effect: "observe"
  };
}
