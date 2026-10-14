// The `undoes` key on the library tool a candidate build offers (t462).
//
// Only a candidate build that can test its Flow and keeps a ledger of its acts
// offers it; the permission wrapper (`../action-permissions.ts`) reads it
// through the ledger and strips it before the domain sees the call.

import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID, type AutomationStudioLlmEvidenceTool } from "../../llm/index.ts";
import { AUTOMATION_STUDIO_SITE_RESET_UNDOES_KEY } from "./contracts.ts";

const UNDOES: JsonObject = {
  type: "string",
  pattern: "^act-[1-9][0-9]{0,3}$",
  description: "Only when this call undoes one of this build's own lasting acts before a trial: the act id the trial listed (core.test_candidate or core.test_subflow). "
    + "Removing what that act created needs no permission. Never for anything that was there before the build began."
};

/** `tool` with `undoes` among its input's properties when it is the library tool; any other tool unchanged. */
export function automationStudioSiteResetUndoesTool(tool: AutomationStudioLlmEvidenceTool): AutomationStudioLlmEvidenceTool {
  const properties = tool.inputSchema.properties;
  if (tool.toolId !== AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID || typeof properties !== "object" || properties === null || Array.isArray(properties)) return tool;
  return { ...tool, inputSchema: { ...tool.inputSchema, properties: { ...properties, [AUTOMATION_STUDIO_SITE_RESET_UNDOES_KEY]: { ...UNDOES } } } };
}
