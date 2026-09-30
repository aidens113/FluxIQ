import type { AutomationStudioPanelCapability } from "../../panel-capabilities/index.ts";
import { AUTOMATION_STUDIO_CONVERSATION_COMMANDS } from "./catalog.ts";

/**
 * The vocabulary a client sent, with Core's own descriptor in place of any
 * capability Core runs itself. The model is then told exactly what Core will
 * do under that id, whatever the client believed, and a client that sends
 * only `{ id: "flow.createHere" }` cannot drift from it. Order is kept, and an
 * id the client did not send is not added: a client offers what it offers.
 */
export function automationStudioConversationCommandVocabulary(capabilities: readonly AutomationStudioPanelCapability[]): AutomationStudioPanelCapability[] {
  return capabilities.map((capability) => AUTOMATION_STUDIO_CONVERSATION_COMMANDS.get(capability.id)?.capability ?? capability);
}
