// A yes or a no to a question a conversation command asked: run what it asked
// about, or set it aside.
//
// Only capabilities listed here run from an answer, and only with the
// arguments the question's own attachment carries. A reference that cannot be
// read, or names something not listed, runs nothing and says so in the thread:
// an answer to a question whose meaning was lost must not be guessed at.
//
// A no is acted on too where leaving the thing waiting would get in the way: a
// declined change is rejected (`discard-change.ts`), because a change left
// waiting blocks the Flow's next build.

import type { AutomationStudioConversationAsk } from "../ask.ts";
import type { AutomationStudioConversationAttachment } from "../turn.ts";
import { AUTOMATION_STUDIO_CONVERSATION_APPLY_CHANGE } from "./apply-change.ts";
import type { AutomationStudioConversationCommand, AutomationStudioConversationCommandContext, AutomationStudioConversationCommandExecution } from "./command.ts";
import { AUTOMATION_STUDIO_CONVERSATION_COMMAND_ASK_PREFIX, AUTOMATION_STUDIO_CONVERSATION_COMMAND_ATTACHMENT } from "./confirmation.ts";
import { AUTOMATION_STUDIO_CONVERSATION_DISCARD_CHANGE } from "./discard-change.ts";
import { executeAutomationStudioConversationCommand } from "./execute.ts";

/** What a yes runs, by the capability the question carries. */
const CONFIRMABLE: ReadonlyMap<string, AutomationStudioConversationCommand> = new Map([
  [AUTOMATION_STUDIO_CONVERSATION_APPLY_CHANGE.capability.id, AUTOMATION_STUDIO_CONVERSATION_APPLY_CHANGE]
]);

/** What a no runs, by the capability the question carries. A capability not listed is simply not done. */
const DECLINABLE: ReadonlyMap<string, AutomationStudioConversationCommand> = new Map([
  [AUTOMATION_STUDIO_CONVERSATION_APPLY_CHANGE.capability.id, AUTOMATION_STUDIO_CONVERSATION_DISCARD_CHANGE]
]);

/**
 * Runs what a granted conversation-command ask carries, or what declining it
 * sets aside. Null when the ask is not one of these, was answered some other
 * way, or was declined with nothing to set aside: nothing is Core's to run then.
 */
export async function runConfirmedAutomationStudioConversationCommand(input: {
  ask: AutomationStudioConversationAsk;
  attachment: AutomationStudioConversationAttachment | null;
  context: AutomationStudioConversationCommandContext;
}): Promise<AutomationStudioConversationCommandExecution | null> {
  const { ask, attachment, context } = input;
  if (!ask.askId.startsWith(AUTOMATION_STUDIO_CONVERSATION_COMMAND_ASK_PREFIX)) return null;
  const answer = ask.answer?.kind;
  if (answer !== "grant" && answer !== "deny") return null;
  const carried = attachment?.kind === AUTOMATION_STUDIO_CONVERSATION_COMMAND_ATTACHMENT ? invocationOf(attachment.ref) : null;
  if (answer === "deny") {
    const setAside = carried ? DECLINABLE.get(carried.capabilityId) : undefined;
    return carried && setAside ? executeAutomationStudioConversationCommand({ command: setAside, context, arguments: carried.arguments }) : null;
  }
  const command = carried ? CONFIRMABLE.get(carried.capabilityId) : undefined;
  if (!carried || !command) {
    const summary = "You said yes, but I could not read what that question would have done, so I have not done anything. Ask me for it again.";
    await context.host.appendAutomationTurn({ projectId: context.projectId, conversationId: context.conversationId, text: summary, ask: null, attachment: null });
    return { capabilityId: carried?.capabilityId ?? "unknown", status: "failed", summary, error: "The confirmation's attachment could not be read." };
  }
  return executeAutomationStudioConversationCommand({ command, context, arguments: carried.arguments });
}

function invocationOf(ref: string): { capabilityId: string; arguments: Record<string, unknown> } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(ref, "base64url").toString("utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as { capabilityId?: unknown; arguments?: unknown };
  if (typeof record.capabilityId !== "string" || !record.arguments || typeof record.arguments !== "object" || Array.isArray(record.arguments)) return null;
  return { capabilityId: record.capabilityId, arguments: record.arguments as Record<string, unknown> };
}
