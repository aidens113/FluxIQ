// The thread a rename or a delete names, found where the caller may change it.
//
// With `projectId` the thread is looked for in that project, after its domain
// scope is asserted as every conversation endpoint asserts it; the request was
// already decided by IAM on that project. Without one it is looked for in every
// project `listProjects` answers for the request's domain scope -- the projects
// `list-conversations` searches -- that the caller may change, which `mayChange`
// decides by IAM, project by project, exactly as a call naming the project
// would be decided. So a thread in a project the caller may not change is
// answered as a thread that does not exist: by the same code and the same words.

import { AutomationStudioConversationRefusal, automationStudioConversationIdOrRefuse, type AutomationStudioConversation } from "../../../../runtime/conversations/index.ts";
import type { AutomationStudioConversationRequestService } from "./types.ts";

/** Whether the caller may change threads in this project, decided by IAM as a call naming it would be. */
export type AutomationStudioConversationProjectGate = (projectId: string) => Promise<boolean>;

/** The thread a request names, and the project it is in. Refused by code when there is none the caller may change. */
export async function automationStudioConversationOfRequest(
  service: AutomationStudioConversationRequestService,
  domainId: string | null | undefined,
  payload: { projectId?: unknown; conversationId?: unknown },
  mayChange: AutomationStudioConversationProjectGate
): Promise<{ projectId: string; conversation: AutomationStudioConversation }> {
  const named = payload.projectId === undefined || payload.projectId === null || payload.projectId === "" ? null : String(payload.projectId);
  if (named !== null) await service.assertProjectDomainAccess(named, domainId);
  const conversationId = automationStudioConversationIdOrRefuse(String(payload.conversationId ?? ""), "conversation");
  const projectIds = named === null ? await changeableProjects(service, domainId, mayChange) : [named];
  const found: Array<{ projectId: string; conversation: AutomationStudioConversation }> = [];
  for (const projectId of projectIds) {
    const thread = await service.conversations.getConversation({ projectId, conversationId, limit: 1 });
    if (thread) found.push({ projectId, conversation: thread.conversation });
  }
  if (found.length > 1) throw new AutomationStudioConversationRefusal("conversation_ambiguous");
  const [only] = found;
  if (!only) throw new AutomationStudioConversationRefusal("conversation_not_found");
  return only;
}

async function changeableProjects(service: AutomationStudioConversationRequestService, domainId: string | null | undefined, mayChange: AutomationStudioConversationProjectGate): Promise<string[]> {
  const { projects } = await service.listProjects(domainId);
  const allowed: string[] = [];
  for (const project of projects) if (await mayChange(project.id)) allowed.push(project.id);
  return allowed;
}
