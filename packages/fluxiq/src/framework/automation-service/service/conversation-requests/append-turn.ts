import type { ConversationTurnAppendRequest } from "../../../../api-contracts/automation.ts";
import {
  automationStudioConversationCommandVocabulary,
  automationStudioConversationKnownTask,
  startAutomationStudioConversationCommand,
  type AutomationStudioConversationFlowReference
} from "../../../../runtime/conversations/index.ts";
import { parseAutomationStudioPanelCapabilities } from "../../panel-capabilities/index.ts";
import { commandContext } from "./command-context.ts";
import { requestedOnScreen } from "./on-screen.ts";
import { requestedAttachment } from "./requested-fields.ts";
import type { AutomationStudioConversationRequest, AutomationStudioConversationRequestDependencies, AutomationStudioConversationRequestService } from "./types.ts";

export async function appendConversationTurnForRequest(
  dependencies: AutomationStudioConversationRequestDependencies,
  request: AutomationStudioConversationRequest,
  projectId: string,
  payload: Partial<ConversationTurnAppendRequest>
) {
  const { service } = dependencies;
  const personTurn = {
    projectId,
    conversationId: String(payload.conversationId ?? ""),
    text: String(payload.text ?? ""),
    actorId: request.actor?.userId,
    attachment: requestedAttachment(payload.attachmentKind, payload.attachmentRef)
  };
  // With the panel's vocabulary, the turn is an instruction as well as a
  // record: Core reads it, decides, and writes the answer into the thread.
  // Core's own descriptor stands in for any capability Core runs itself,
  // and when the decision is one of those Core runs it here, for whichever
  // client asked (`runtime/conversations/commands/`). `execution` says
  // what came of it, and is null when the client is to run what was chosen.
  if (Array.isArray(payload.capabilities)) {
    const onScreen = requestedOnScreen(payload.onScreen);
    const caller = request.actor ? service.conversations.callerFor(request.actor) : null;
    // The exact words of a task with a saved Flow start it with no model call (task speed S6), asked through the same read route the command uses.
    const lookup = commandContext(dependencies, request, { projectId, conversationId: personTurn.conversationId, startLocation: onScreen.pageUrl ?? null });
    const answer = await service.conversations.respondToPersonTurn({
      ...personTurn,
      capabilities: automationStudioConversationCommandVocabulary(parseAutomationStudioPanelCapabilities(payload.capabilities)),
      flows: await projectFlows(service, projectId),
      onScreen,
      caller: caller ? { userId: caller.userId, sessionId: caller.sessionId } : null,
      ...(lookup ? { knownTask: automationStudioConversationKnownTask(lookup) } : {})
    });
    const context = commandContext(dependencies, request, { projectId, conversationId: personTurn.conversationId, startLocation: onScreen.pageUrl ?? null, attachedRecordingId: onScreen.recordingId, interpretationCostUsd: answer.interpretationCostUsd, interpretationCalls: answer.interpretationCalls });
    const execution = context ? await startAutomationStudioConversationCommand({ response: answer.response, context }) : null;
    return { turn: answer.turn, response: answer.response ? { ...answer.response, execution } : null, problem: answer.problem };
  }
  const turn = await service.conversations.appendTurn(personTurn);
  return { turn };
}

/**
 * The project's Flows by name, or null when they could not be listed. Null is
 * not an empty project: the model is told the list is missing and passes a
 * named Flow on as written, so a failed listing costs the person a lookup, not
 * their instruction.
 */
async function projectFlows(service: AutomationStudioConversationRequestService, projectId: string): Promise<AutomationStudioConversationFlowReference[] | null> {
  if (!service.listFlows) return null;
  try {
    const entries = await service.listFlows(projectId);
    return entries.map((entry) => ({ flowId: entry.flow.flowId, name: entry.flow.name || entry.flow.flowId }));
  } catch (error) {
    if (error instanceof Error && /domain scope|unavailable/iu.test(error.message)) throw error;
    return null;
  }
}
