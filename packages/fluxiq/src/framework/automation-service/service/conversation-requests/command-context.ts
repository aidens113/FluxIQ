import { automationStudioConversationCommandPort, type AutomationStudioConversationCommandContext } from "../../../../runtime/conversations/index.ts";
import type { AutomationStudioConversationRequest, AutomationStudioConversationRequestDependencies } from "./types.ts";

/**
 * What a conversation command runs with, for this request: the registry,
 * called as this request's actor in its scope, under the session a paired
 * client's person has unlocked (`commands/caller.ts`), and the page on screen
 * as a build's start. Null without an actor, which the registry never lets
 * through, so there is always someone the work is done as.
 */
export function commandContext(
  dependencies: AutomationStudioConversationRequestDependencies,
  request: AutomationStudioConversationRequest,
  target: { projectId: string; conversationId: string; startLocation: string | null; attachedRecordingId?: string | undefined; interpretationCostUsd?: number | undefined; interpretationCalls?: number | undefined; humanness?: number | undefined }
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
    keyLocked: caller.keyLocked,
    keyNeedsUnlock: caller.keyNeedsUnlock,
    keyLockReason: caller.keyLockReason,
    noteKeySetupStepTold: () => conversations.noteKeySetupStepTold(caller.userId),
    // The calls above run as the unlocked session, so a run the command starts says itself that a paired client asked (`commands/run-flow.ts`).
    paired: caller.paired,
    startLocation: target.startLocation,
    // The recording attached to the message that asked, from its `onScreen` alone (`commands/create-here.ts`).
    ...(target.attachedRecordingId ? { attachedRecordingId: target.attachedRecordingId } : {}),
    // What reading the turn cost, carried into the purse of a Flow the command builds (`commands/build.ts`).
    ...(target.interpretationCostUsd === undefined ? {} : { interpretationCostUsd: target.interpretationCostUsd }),
    ...(target.interpretationCalls === undefined ? {} : { interpretationCalls: target.interpretationCalls }),
    // The person's humanness for the build or run the command starts (`commands/build.ts`, `commands/run-flow.ts`).
    ...(target.humanness === undefined ? {} : { humanness: target.humanness })
  };
}
