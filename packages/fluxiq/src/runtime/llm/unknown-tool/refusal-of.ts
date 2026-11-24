import type { JsonObject } from "../../../core/index.ts";
import { automationStudioLlmDecisionInputValueOf } from "../decision-reading/index.ts";
import type { AutomationStudioLlmUnusableDecisionUnknownTool } from "../unusable-decision.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_UNKNOWN_TOOL_REFUSED_CODE } from "./refusal.ts";
import { automationStudioLlmEvidenceNearestToolId } from "./nearest-tool-id.ts";

/**
 * The refusal of a call naming `asked`, among the tools offered: its issue
 * code, and the ids the model is shown back with the nearest.
 *
 * An id that is no tool but a value one offered tool's input lists -- a
 * node's id where the tool that runs nodes goes (t1025: 8 of 22 unreadable
 * replies of the bigbox runs of 2026-11-24) -- is told as that: the tool that
 * takes it is the nearest, and the input key it goes under is named
 * (`takenBy`). Read from the offered input schemas alone. A call whose input
 * already named it there was read as that tool's (`../decision-reading/`), so
 * what reaches here is a call whose input still needs writing.
 */
export function automationStudioLlmEvidenceUnknownToolRefusal(asked: string, offered: readonly { toolId: string; inputSchema?: JsonObject }[]): { issueCodes: string[]; unknownTool: AutomationStudioLlmUnusableDecisionUnknownTool } {
  const ids = offered.map((tool) => tool.toolId);
  const places = automationStudioLlmDecisionInputValueOf(asked, offered.flatMap((tool) => tool.inputSchema ? [{ toolId: tool.toolId, inputSchema: tool.inputSchema }] : []));
  const takenBy = places.length === 1 ? places[0] : undefined;
  const nearest = takenBy?.toolId ?? automationStudioLlmEvidenceNearestToolId(asked, ids);
  return { issueCodes: [AUTOMATION_STUDIO_LLM_EVIDENCE_UNKNOWN_TOOL_REFUSED_CODE], unknownTool: { toolId: asked, offered: ids, ...(nearest ? { nearest } : {}), ...(takenBy ? { takenBy } : {}) } };
}
