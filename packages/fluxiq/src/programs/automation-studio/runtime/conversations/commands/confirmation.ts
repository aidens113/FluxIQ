// "Apply this change?": the question a command leaves when its work needs a
// yes before it takes effect.
//
// The ask is an ordinary `confirm` that nothing parks on. What a yes would run
// travels on the ask's turn as a `conversation-command` attachment -- base64url
// JSON of the capability id and its arguments, the same carrying the panel's
// own confirmations use -- so the executor that sees the ask granted runs
// exactly what was asked about, with no second store to fall out of step. The
// ask id's prefix is how `answer-ask` knows the executor, and not the panel,
// owns the yes.

import { randomUUID } from "node:crypto";
import type { AutomationStudioConversationCommandConfirmation, AutomationStudioConversationCommandContext } from "./command.ts";

/** The ask id prefix of a question a conversation command asked. */
export const AUTOMATION_STUDIO_CONVERSATION_COMMAND_ASK_PREFIX = "conversation-command.";

/** The attachment kind that carries what a granted conversation-command ask runs. */
export const AUTOMATION_STUDIO_CONVERSATION_COMMAND_ATTACHMENT = "conversation-command";

/** The store's bound on an attachment reference. */
const ATTACHMENT_REF_MAX = 1_000;

/** Writes the question. Answers with the ask's id, or null when what it would run is too large to carry and nothing was asked. */
export async function askToConfirmAutomationStudioConversationCommand(
  context: Pick<AutomationStudioConversationCommandContext, "host" | "projectId" | "conversationId">,
  confirm: AutomationStudioConversationCommandConfirmation
): Promise<string | null> {
  const ref = Buffer.from(JSON.stringify({ capabilityId: confirm.capabilityId, arguments: confirm.arguments }), "utf8").toString("base64url");
  if (ref.length > ATTACHMENT_REF_MAX) return null;
  const askId = `${AUTOMATION_STUDIO_CONVERSATION_COMMAND_ASK_PREFIX}${randomUUID()}`;
  await context.host.appendAutomationTurn({
    projectId: context.projectId,
    conversationId: context.conversationId,
    text: confirm.text,
    attachment: { kind: AUTOMATION_STUDIO_CONVERSATION_COMMAND_ATTACHMENT, ref },
    ask: {
      askId,
      kind: "confirm",
      // Nothing waits on it: a yes runs the change, and no answer leaves it undone.
      parks: false,
      timeoutMs: null,
      onTimeout: null,
      options: null,
      routes: null,
      consequences: confirm.consequences,
      missing: null,
      control: { name: confirm.control, kind: "panel action" },
      permissionRequest: null
    }
  });
  return askId;
}
