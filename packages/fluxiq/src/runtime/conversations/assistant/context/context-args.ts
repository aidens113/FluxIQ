import type { AssistantToolEntry } from "@fluxiq/contracts/program-api-inputs";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { PanelAssistantContext } from "../types.ts";

/**
 * The model's input with the fields the page fills (`contextArgs`) filled from
 * the person's page and selection, where the model left them out. A field the
 * model wrote is kept as written: the call's own checks and IAM decide it, and
 * the consent check compares what it targets with what was selected.
 */
export function panelAssistantInputWithContext(tool: AssistantToolEntry, input: JsonObject, context: PanelAssistantContext): JsonObject {
  const filled: JsonObject = { ...input };
  for (const [field, key] of Object.entries(tool.contextArgs)) {
    if (filled[field] !== undefined) continue;
    const value = context[key];
    if (value === undefined) continue;
    filled[field] = (Array.isArray(value) ? [...value] : value) as JsonValue;
  }
  return filled;
}
