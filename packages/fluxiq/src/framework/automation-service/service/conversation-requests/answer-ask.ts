import type { ConversationAnswerRequest } from "../../../../api-contracts/automation.ts";
import {
  runConfirmedAutomationStudioConversationCommand,
  AUTOMATION_STUDIO_CONVERSATION_COMMAND_ASK_PREFIX,
  type AutomationStudioConversationAsk,
  type AutomationStudioConversationCommandExecution
} from "../../../../runtime/conversations/index.ts";
import { commandContext } from "./command-context.ts";
import { requiredAnswerKind } from "./requested-fields.ts";
import type { AutomationStudioConversationRequest, AutomationStudioConversationRequestDependencies } from "./types.ts";

export async function answerConversationAskForRequest(
  dependencies: AutomationStudioConversationRequestDependencies,
  request: AutomationStudioConversationRequest,
  projectId: string,
  payload: Partial<ConversationAnswerRequest>
) {
  const { service } = dependencies;
  const askId = String(payload.askId ?? "");
  const kind = requiredAnswerKind(payload.kind);
  // A question a conversation command asked ("apply this change?") is
  // Core's to act on when granted. It is read before the answer is written
  // so that only the answer that settles it runs anything: an exact resend
  // replays the stored answer and must not apply the change a second time.
  const commandAsk = askId.startsWith(AUTOMATION_STUDIO_CONVERSATION_COMMAND_ASK_PREFIX) ? await service.conversations.getAsk({ projectId, askId }) : null;
  const ask = await service.conversations.answerAsk({
    projectId,
    askId,
    kind,
    value: typeof payload.value === "string" ? payload.value : undefined,
    actorId: request.actor?.userId
  });
  if (commandAsk?.status !== "pending") return { ask };
  return { ask, execution: await confirmedExecution(dependencies, request, projectId, ask) };
}

/** Runs what a granted conversation-command ask carries, or sets aside what a declined one offered, and says what came of it. Null for any other answer. */
async function confirmedExecution(
  dependencies: AutomationStudioConversationRequestDependencies,
  request: AutomationStudioConversationRequest,
  projectId: string,
  ask: AutomationStudioConversationAsk
): Promise<AutomationStudioConversationCommandExecution | null> {
  const context = commandContext(dependencies, request, { projectId, conversationId: ask.conversationId, startLocation: null });
  if (!context || (ask.answer?.kind !== "grant" && ask.answer?.kind !== "deny")) return null;
  const turn = await dependencies.service.conversations.getTurn({ projectId, conversationId: ask.conversationId, turnId: ask.turnId });
  return runConfirmedAutomationStudioConversationCommand({ ask, attachment: turn?.attachment ?? null, context });
}
