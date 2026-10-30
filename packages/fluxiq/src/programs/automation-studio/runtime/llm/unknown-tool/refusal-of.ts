import type { AutomationStudioLlmUnusableDecisionUnknownTool } from "../unusable-decision.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_UNKNOWN_TOOL_REFUSED_CODE } from "./refusal.ts";
import { automationStudioLlmEvidenceNearestToolId } from "./nearest-tool-id.ts";

/** The refusal of a call naming `asked`, among the tools offered: its issue code, and the ids the model is shown back with the nearest. */
export function automationStudioLlmEvidenceUnknownToolRefusal(asked: string, offered: readonly { toolId: string }[]): { issueCodes: string[]; unknownTool: AutomationStudioLlmUnusableDecisionUnknownTool } {
  const ids = offered.map((tool) => tool.toolId);
  const nearest = automationStudioLlmEvidenceNearestToolId(asked, ids);
  return { issueCodes: [AUTOMATION_STUDIO_LLM_EVIDENCE_UNKNOWN_TOOL_REFUSED_CODE], unknownTool: { toolId: asked, offered: ids, ...(nearest ? { nearest } : {}) } };
}
