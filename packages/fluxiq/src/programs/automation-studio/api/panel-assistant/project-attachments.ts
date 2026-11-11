// A panel turn's project-bound attachment, read in the project the read names:
// the one its reference names, or for a reference that names none, the request's.
//
// The panel thread is the person's own, decided as `selfUser`. What a proposal
// attachment shows is a project's own record, so the project is decided on its
// own: by IAM through the registry, as a call of the endpoint's action naming
// that project would be, then the project's domain scope is asserted as every
// conversation endpoint asserts it. Only then is it read, by Core's own resolver
// (the one `get-conversation-attachment` uses, with its limits).

import { automationStudioConversationAttachmentResolver, type AutomationStudioConversationAttachmentReads } from "../../../../runtime/conversations/index.ts";
import type { PanelAssistantProjectAttachments } from "../../../../runtime/conversations/assistant/index.ts";
import type { GlobalProgramApiRegistry, ProgramApiActor, ProgramApiResponse } from "../../../_shared/api.ts";

/** What reading a project's attachment needs from the service. */
export type PanelAssistantProjectReads = AutomationStudioConversationAttachmentReads & {
  assertProjectDomainAccess(projectId: string, domainId?: string | null): Promise<void>;
};

/** Reads a project-bound attachment for `request`'s caller, in the project the read names, once IAM and the domain scope allow it. */
export function panelAssistantProjectAttachments(
  registry: GlobalProgramApiRegistry,
  service: PanelAssistantProjectReads,
  request: { actor: ProgramApiActor; scope: { domainId?: string | null }; action: string }
): PanelAssistantProjectAttachments {
  const resolve = automationStudioConversationAttachmentResolver(service);
  return async (read) => {
    const decided = await registry.authorize({ actor: request.actor, action: request.action, permission: "programs.read", resources: { kind: "project", projectId: read.projectId }, programId: "automation-studio" });
    if (!decided.allowed) throw refusal(decided.response);
    await service.assertProjectDomainAccess(read.projectId, request.scope.domainId);
    return resolve(read);
  };
}

/** The registry's refusal as a thrown error that keeps its code, so the endpoint answers it unchanged. */
function refusal(response: ProgramApiResponse<never>): Error {
  const error = new Error(response.error ?? "The project could not be read.");
  return Object.assign(error, { diagnostic: { code: response.errorCode } });
}
