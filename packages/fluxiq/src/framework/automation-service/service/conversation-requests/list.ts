import type { ConversationListRequest } from "../../../../api-contracts/automation.ts";
import type { AutomationStudioConversation } from "../../../../runtime/conversations/index.ts";
import { automationStudioPageLimit } from "../../../persistence/automation/index.ts";
import { requestedStatus, requestedSubject } from "./requested-fields.ts";
import type { AutomationStudioConversationRequestService } from "./types.ts";

/** A project whose conversations could not be read, named by id with why, so a list across projects shows the rest. */
export type AutomationStudioUnreadableConversationProject = { projectId: string; reason: string };

/** What a conversation list answers: the threads read, and every project that could not be read. */
export type AutomationStudioConversationListing = {
  conversations: AutomationStudioConversation[];
  unreadableProjects: AutomationStudioUnreadableConversationProject[];
};

export async function listConversationsForRequest(
  service: AutomationStudioConversationRequestService,
  domainId: string | null | undefined,
  payload: Partial<ConversationListRequest>
): Promise<AutomationStudioConversationListing> {
  const narrow = { subject: requestedSubject(payload.subjectKind, payload.subjectId), status: requestedStatus(payload.status), limit: payload.limit };
  if (payload.projectId !== null && payload.projectId !== undefined) {
    const projectId = String(payload.projectId);
    await service.assertProjectDomainAccess(projectId, domainId);
    return { conversations: await service.conversations.listConversations({ projectId, ...narrow }), unreadableProjects: [] };
  }
  // Across every project the caller can see. `listProjects` is the same
  // entitlement the `projects` endpoint grants for this domain scope, so
  // there is one answer to "what may this caller see" rather than two, and
  // no per-project refusal to swallow: a project that is out of scope is
  // not in the list at all.
  const { projects } = await service.listProjects(domainId);
  const limit = automationStudioPageLimit(payload.limit);
  const found: AutomationStudioConversation[] = [];
  const unreadableProjects: AutomationStudioUnreadableConversationProject[] = [];
  for (const project of projects) {
    if (found.length >= limit) break;
    try {
      found.push(...await service.conversations.listConversations({ projectId: project.id, ...narrow, limit: limit - found.length }));
    } catch (error) {
      // Each project is read on its own: one whose store cannot be read is named with its reason, and the
      // others are still listed, so the caller never loses every thread to one project nor reads a short list as whole.
      unreadableProjects.push({ projectId: project.id, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { conversations: found.slice(0, limit), unreadableProjects };
}
