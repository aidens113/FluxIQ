// The `undoes` key on the library tool a candidate build offers (t462).
//
// Only a candidate build that can test its Flow and keeps a ledger of its acts
// offers it; the permission wrapper (`../action-permissions.ts`) reads it
// through the ledger and strips it before the domain sees the call.
//
// Since P4 the key is a hint: the ledger pairs a press that reverses an act's
// effect with that act whether or not the call names it (`./claims.ts`).

import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID, type AutomationStudioLlmEvidenceTool } from "../../llm/index.ts";
import { AUTOMATION_STUDIO_SITE_RESET_UNDOES_KEY } from "../reset-settlement/index.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS } from "../site-reset/words.ts";

const UNDOES: JsonObject = {
  type: "string",
  pattern: "^act-[1-9][0-9]{0,3}$",
  description: "Optional hint, only when this call undoes one of this build's own lasting acts: the act id a trial listed (core.test_candidate or core.test_subflow). "
    + "Core pairs an undo with its act by its effect: a press that puts back exactly what an act changed, at the same place, counts as that act's undo without this key. "
    + "Name the act to remove what it created without asking. Never for anything that was there before the build began."
};

const DESTINATION: JsonObject = {
  type: "string", pattern: "^destination-[1-9][0-9]{0,3}$",
  description: "The ref printed under resetDestinations.collections by an earlier complete read of a list, or of a whole page that has no list (marked page: true), naming where a reversible lasting effect would show. "
    + "Needed by any reversible lasting press (create_new, modify_existing or delete) made before the build's first lasting change that has no other witness: read that list (or, for a creation, the page where its item will appear) completely first, in the tab where the press is made, then return and supply its ref. "
    // The same clause as the build's guidance and the witness refusal (`../site-reset/words.ts`, `ownUrl`; t743, photo debug fix 2).
    + `${WORDS.ownUrl()} `
    + "A press on a control inside a list already read complete, or on a control whose own state the page shows, needs none, and an identified create_new whose exact same-scope original inventory proves its subject absent needs none either. "
    + "A reversible act may also name, by such a ref, the list where its effect would show on its own call or on a later look that names it under undoes; with no undoes, a ref settles nothing. "
    + "Never invent a ref or use one read in another tab. This is a build reset precondition, not permission or proof of a future inverse."
};

/** `tool` with `undoes` among its input's properties when it is the library tool; any other tool unchanged. */
export function automationStudioSiteResetUndoesTool(tool: AutomationStudioLlmEvidenceTool, options: { createBaselines?: boolean } = {}): AutomationStudioLlmEvidenceTool {
  const properties = tool.inputSchema.properties;
  if (tool.toolId !== AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID || typeof properties !== "object" || properties === null || Array.isArray(properties)) return tool;
  return { ...tool, description: tool.description + " Before creating an effect whose undo removes an item from another page or list, inspect that destination's complete item inventory first. The reset needs positive evidence that its subject did not already exist there. An existing item's quantity requires an exact inverse; a matching name or a partial change is insufficient.", inputSchema: { ...tool.inputSchema, properties: { ...properties, [AUTOMATION_STUDIO_SITE_RESET_UNDOES_KEY]: { ...UNDOES }, ...(options.createBaselines ? { resetDestination: { ...DESTINATION } } : {}) } } };
}
