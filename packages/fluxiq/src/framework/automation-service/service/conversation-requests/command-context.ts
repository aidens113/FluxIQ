import { automationStudioConversationCommandPort, type AutomationStudioConversationCommandContext } from "../../../../runtime/conversations/index.ts";
import type { AutomationStudioConversationRequest, AutomationStudioConversationRequestDependencies } from "./types.ts";

/**
 * What a conversation command runs with, for this request: the registry,
 * called as this request's actor in its scope, under the request's own session
 * (`commands/caller.ts`), and the page on screen
 * as a build's start. Null without an actor, which the registry never lets
 * through, so there is always someone the work is done as.
 */
export function commandContext(
  dependencies: AutomationStudioConversationRequestDependencies,
  request: AutomationStudioConversationRequest,
  target: { projectId: string; conversationId: string; startLocation: string | null; attachedRecordingId?: string | undefined; interpretationCostUsd?: number | undefined; interpretationCalls?: number | undefined; taskActs?: string[] | undefined; humanness?: number | undefined }
): AutomationStudioConversationCommandContext | null {
  if (!request.actor) return null;
  const conversations = dependencies.service.conversations;
  const caller = conversations.callerFor(request.actor);
  return {
    port: automationStudioConversationCommandPort({ registry: dependencies.registry, actor: { ...request.actor, sessionId: caller.sessionId }, scope: request.scope }),
    host: conversations,
    projectId: target.projectId,
    conversationId: target.conversationId,
    sessionId: caller.sessionId,
    // The calls above run as the request's own session, so a run the command starts says itself that a paired client asked (`commands/run-flow.ts`).
    paired: caller.paired,
    startLocation: target.startLocation,
    // The recording attached to the message that asked, from its `onScreen` alone (`commands/create-here.ts`).
    ...(target.attachedRecordingId ? { attachedRecordingId: target.attachedRecordingId } : {}),
    // What reading the turn cost, carried into the purse of a Flow the command builds (`commands/build.ts`).
    ...(target.interpretationCostUsd === undefined ? {} : { interpretationCostUsd: target.interpretationCostUsd }),
    ...(target.interpretationCalls === undefined ? {} : { interpretationCalls: target.interpretationCalls }),
    // What the reading declared the task will cause, for its one question when it starts (`commands/build.ts`, t976).
    ...(target.taskActs === undefined ? {} : { taskActs: target.taskActs }),
    // The person's humanness for the build or run the command starts (`commands/build.ts`, `commands/run-flow.ts`).
    ...(target.humanness === undefined ? {} : { humanness: target.humanness })
  };
}
