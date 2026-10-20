// The `undoes` key on the library tool a candidate build offers (t462).
//
// Only a candidate build that can test its Flow and keeps a ledger of its acts
// offers it; the permission wrapper (`../action-permissions.ts`) reads it
// through the ledger and strips it before the domain sees the call.

import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID, type AutomationStudioLlmEvidenceTool } from "../../llm/index.ts";
import { AUTOMATION_STUDIO_SITE_RESET_UNDOES_KEY } from "../reset-settlement/index.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS } from "./words.ts";

const UNDOES: JsonObject = {
  type: "string",
  pattern: "^act-[1-9][0-9]{0,3}$",
  description: "Only when this call undoes one of this build's own lasting acts before a trial: the act id the trial listed (core.test_candidate or core.test_subflow). "
    + "Removing what that act created needs no permission. Never for anything that was there before the build began."
};

const DESTINATION: JsonObject = {
  type: "string", pattern: "^destination-[1-9][0-9]{0,3}$",
  description: "The ref printed under resetDestinations.collections by an earlier complete observation of a list, naming the list where a reversible lasting effect would show. "
    + "Needed by any reversible lasting press (create_new, modify_existing or delete) made before the build's first lasting change that has no other witness: observe that list completely first, then return and supply its ref. "
    // The same clause as the build's guidance and the witness refusal (`./words.ts`, `ownUrl`; t743, photo debug fix 2).
    + `${WORDS.ownUrl()} `
    + "A press on a control inside a list already read complete, or on a control whose own state the page shows, needs none, and an identified create_new whose exact same-scope original inventory proves its subject absent needs none either. "
    + "A reversible act may also name, by such a ref, the list where its effect would show on its own call or on a later look that names it under undoes; with no undoes, a ref settles nothing. "
    + "Never invent a ref or use another resource's list. This is a build reset precondition, not permission or proof of a future inverse."
};

/** `tool` with `undoes` among its input's properties when it is the library tool; any other tool unchanged. */
export function automationStudioSiteResetUndoesTool(tool: AutomationStudioLlmEvidenceTool, options: { createBaselines?: boolean } = {}): AutomationStudioLlmEvidenceTool {
  const properties = tool.inputSchema.properties;
  if (tool.toolId !== AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID || typeof properties !== "object" || properties === null || Array.isArray(properties)) return tool;
  return { ...tool, description: tool.description + " Before creating an effect whose undo removes an item from another page or list, inspect that destination's complete item inventory first. The reset needs positive evidence that its subject did not already exist there. An existing item's quantity requires an exact inverse; a matching name or a partial change is insufficient.", inputSchema: { ...tool.inputSchema, properties: { ...properties, [AUTOMATION_STUDIO_SITE_RESET_UNDOES_KEY]: { ...UNDOES }, ...(options.createBaselines ? { resetDestination: { ...DESTINATION } } : {}) } } };
}
