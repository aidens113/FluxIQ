import type { ConversationListRequest } from "../../../../api-contracts/automation.ts";
import type { AutomationStudioConversation } from "../../../../runtime/conversations/index.ts";
import { automationStudioPageLimit } from "../../../persistence/automation/index.ts";
import { requestedStatus, requestedSubject } from "./requested-fields.ts";
import type { AutomationStudioConversationRequestService } from "./types.ts";

export async function listConversationsForRequest(
  service: AutomationStudioConversationRequestService,
  domainId: string | null | undefined,
  payload: Partial<ConversationListRequest>
): Promise<AutomationStudioConversation[]> {
  const narrow = { subject: requestedSubject(payload.subjectKind, payload.subjectId), status: requestedStatus(payload.status), limit: payload.limit };
  if (payload.projectId !== null && payload.projectId !== undefined) {
    const projectId = String(payload.projectId);
    await service.assertProjectDomainAccess(projectId, domainId);
    return service.conversations.listConversations({ projectId, ...narrow });
  }
  // Across every project the caller can see. `listProjects` is the same
  // entitlement the `projects` endpoint grants for this domain scope, so
  // there is one answer to "what may this caller see" rather than two, and
  // no per-project refusal to swallow: a project that is out of scope is
  // not in the list at all.
  const { projects } = await service.listProjects(domainId);
  const limit = automationStudioPageLimit(payload.limit);
  const found: AutomationStudioConversation[] = [];
  for (const project of projects) {
    if (found.length >= limit) break;
    found.push(...await service.conversations.listConversations({ projectId: project.id, ...narrow, limit: limit - found.length }));
  }
  return found.slice(0, limit);
}
