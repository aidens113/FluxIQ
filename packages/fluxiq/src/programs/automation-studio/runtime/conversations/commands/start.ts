import type { AutomationStudioConversationResponse } from "../instructions/index.ts";
import { AUTOMATION_STUDIO_CONVERSATION_COMMANDS } from "./catalog.ts";
import type { AutomationStudioConversationCommandContext, AutomationStudioConversationCommandExecution } from "./command.ts";
import { executeAutomationStudioConversationCommand } from "./execute.ts";

/**
 * What Core does with the capability a person's turn became. Null when there
 * is nothing for Core to run: the turn was a reply or a question, it waits on
 * a confirmation, or the capability is one only the client can run -- which
 * then runs it, exactly as before.
 *
 * Never throws. A command whose result could not be written still answers,
 * as `failed` with the reason, because the person's turn and Core's "Doing
 * ..." are already in the thread and a failed request would read as the whole
 * message being lost.
 */
export async function startAutomationStudioConversationCommand(input: {
  response: AutomationStudioConversationResponse | null;
  context: AutomationStudioConversationCommandContext;
}): Promise<AutomationStudioConversationCommandExecution | null> {
  const response = input.response;
  if (!response || !response.runNow || response.decision?.kind !== "invoke") return null;
  const invocation = response.decision.invocation;
  const command = AUTOMATION_STUDIO_CONVERSATION_COMMANDS.get(invocation.capabilityId);
  if (!command) return null;
  try {
    return await executeAutomationStudioConversationCommand({ command, context: input.context, arguments: invocation.arguments });
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    return { capabilityId: command.capability.id, status: "failed", summary: `"${command.capability.title}" ran, but what it came to could not be written into the conversation: ${cause}`, error: cause };
  }
}
