// The thread a recovery reads, found from the run it is repairing.
//
// A run's questions are asked in a thread whose subject is the run
// (`service.ts` binds the executor's parking port to `{kind: "run", id: runId}`),
// and the longer conversation about what the person wants the Flow to do is
// attached to the Flow. Both bear on a repair, and the run's is the nearer of
// the two, so it is preferred and the Flow's stands in when the run has none.
//
// A free function rather than a service method: `AutomationStudioService` is at
// its own method budget, this reads two things off the conversations
// collaborator and combines them, and a port the service passes as a lambda is
// exactly the shape `annotation/ports.ts` already uses for everything else the
// recovery reaches outside itself.

import type {
  AutomationStudioConversation,
  AutomationStudioConversationSubject,
  AutomationStudioConversationTurn
} from "../../conversations/index.ts";

/** How many turns a recovery reads back. The request's own packer bounds what it then carries. */
export const AUTOMATION_STUDIO_RECOVERY_CONVERSATION_TURN_LIMIT = 40;

/** The narrow slice of the conversations collaborator this reads. */
export type AutomationStudioRecoveryConversationReader = {
  listConversations(input: { projectId: string; subject?: AutomationStudioConversationSubject; limit?: number }): Promise<AutomationStudioConversation[]>;
  getConversation(input: { projectId: string; conversationId: string; limit?: number }): Promise<{ turns: AutomationStudioConversationTurn[] } | null>;
};

/**
 * The turns the person and the automation have exchanged about this run, in
 * reading order, or an empty list when there is no thread to read.
 *
 * Empty is not an error and is never reported as one. A deployment may keep no
 * threads, a Flow may never have been talked about, and either way the repair
 * goes ahead with what it does have -- which is the point of the failure entry
 * point being entered at all.
 */
export async function automationStudioRecoveryConversationTurns(
  reader: AutomationStudioRecoveryConversationReader,
  input: { projectId: string; flowId: string; runId: string }
): Promise<readonly AutomationStudioConversationTurn[]> {
  for (const subject of [{ kind: "run", id: input.runId }, { kind: "flow", id: input.flowId }] as const) {
    const [conversation] = await reader.listConversations({ projectId: input.projectId, subject, limit: 1 });
    if (!conversation) continue;
    const thread = await reader.getConversation({
      projectId: input.projectId,
      conversationId: conversation.conversationId,
      limit: AUTOMATION_STUDIO_RECOVERY_CONVERSATION_TURN_LIMIT
    });
    if (thread?.turns.length) return thread.turns;
  }
  return [];
}
