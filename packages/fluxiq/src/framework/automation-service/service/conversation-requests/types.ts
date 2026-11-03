// What the conversation requests need, named without the program API: the
// caller's project entitlement and the collaborator that holds the store, the
// registry a conversation command calls back through, and the request's own
// caller and scope.

import type { AutomationStudioConversations, automationStudioConversationCommandPort } from "../../../../runtime/conversations/index.ts";

type CommandPortInput = Parameters<typeof automationStudioConversationCommandPort>[0];

export type AutomationStudioConversationRequestService = {
  assertProjectDomainAccess(projectId: string, domainId?: string | null): Promise<void>;
  /** Exactly what the `projects` endpoint returns for a domain scope: the caller's entitlement, already decided. */
  listProjects(domainId?: string | null): Promise<{ projects: Array<{ id: string }> }>;
  /**
   * The project's Flows, so a person can name one the way they know it. Optional:
   * without it a Flow the person names is passed on as they wrote it.
   */
  listFlows?(projectId: string): Promise<Array<{ flow: { flowId: string; name: string } }>>;
  readonly conversations: AutomationStudioConversations;
};

export type AutomationStudioConversationRequestDependencies = {
  readonly registry: CommandPortInput["registry"];
  readonly service: AutomationStudioConversationRequestService;
};

/** Who is asking and in what scope: the part of a program request a conversation command runs under. */
export type AutomationStudioConversationRequest = {
  readonly scope: CommandPortInput["scope"];
  readonly actor?: CommandPortInput["actor"];
};
