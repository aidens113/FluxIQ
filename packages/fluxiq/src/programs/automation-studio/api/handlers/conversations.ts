// The endpoints a person uses to talk to FluxIQ: the threads, the thread they
// start, one thread, what a turn shows, a turn they write, and the answer to
// an ask.
//
// **Every handler here asserts the project's domain access before it reads
// anything**, for the reason the dataset handlers do (`datasets.ts`): a thread
// holds free text, and some of that text came out of a domain -- the control
// named on a permission ask, the sentence Core built around it. That is stored
// content, so a domain-scoped client must not be able to point itself at
// another domain's project and read its conversations out. When these
// endpoints are registered, `tests/domain-scope.test.ts` pins the set and its
// `DOMAIN_SCOPED` list gains every one of them that names a project. The
// across-projects listing is the exception and asserts nothing, because it
// takes no project to assert about: it searches exactly the projects
// `listProjects` returns for the request's domain, which is the same
// entitlement the `projects` endpoint grants.
//
// Reads take `programs.read`; writing a turn or answering an ask takes
// `programs.write` and is `authoring`, not `destructive`: answering is how a
// person authorises a consequential act, and the act itself is still gated
// where it happens. Making the answer itself PIN-gated would put the
// ceremony on the wrong side of the question.
//
// This module registers against its own dependency record rather than
// `AutomationStudioApiDependencies`: it needs the domain-scope check, the
// caller's project entitlement and the collaborator that holds the store, and
// naming those three is what lets a test register these endpoints without a
// service. `register.ts` builds the record from the service's `conversations`
// field in one line.

import { endpointResource } from "../../../_shared/iam/index.ts";
import { AUTOMATION_STUDIO_ENDPOINTS, type ConversationAnswerRequest, type ConversationAttachmentRequest, type ConversationListRequest, type ConversationOpenRequest, type ConversationReadRequest, type ConversationTurnAppendRequest } from "../../../../api-contracts/automation.ts";
import type { GlobalProgramApiRegistry } from "../../../_shared/api.ts";
import type { AutomationStudioConversations } from "../../../../framework/automation-service/index.ts";
import {
  answerConversationAskForRequest,
  appendConversationTurnForRequest,
  listConversationsForRequest,
  requestedSubject,
  type AutomationStudioConversationRequestService
} from "../../../../framework/automation-service/service/conversation-requests/index.ts";

/**
 * What the conversation endpoints need: the registry, the domain-scope check,
 * the caller's project entitlement, and the collaborator that holds the store.
 *
 * `conversations` is read off the service inside each handler rather than
 * pulled out at registration, the way `runDatasets` is. Registering the API
 * must touch nothing on the service -- `tests/llm-generation.test.ts` pins that
 * by registering against a service that throws on every property it does not
 * expect -- and a field read at registration time would also freeze whatever
 * the service held then.
 */
export type AutomationStudioConversationApiDependencies = {
  readonly registry: GlobalProgramApiRegistry;
  readonly service: AutomationStudioConversationRequestService;
};

export function registerAutomationStudioConversationEndpoints(dependencies: AutomationStudioConversationApiDependencies): void {
  const { registry, service } = dependencies;
  const conversations = (): AutomationStudioConversations => service.conversations;

  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listConversations,
    permission: "programs.read",
    classification: "read",
    action: "studio:ListConversations",
    accessLevel: "List",
    resource: endpointResource.custom(["project"], (request) => {
      const projectId = request.payload !== null && typeof request.payload === "object" ? (request.payload as { projectId?: unknown }).projectId : undefined;
      return projectId === null || projectId === undefined ? { kind: "workspace" } : { kind: "project", projectId: String(projectId) };
    }),
    list: {
      items: (payload) => {
        const found = (payload as { conversations?: unknown } | null)?.conversations;
        return Array.isArray(found) ? found : [];
      },
      ref: (item) => ({ kind: "project", projectId: (item as { projectId?: unknown } | null)?.projectId }),
      replace: (payload, kept) => ({ ...(payload as object), conversations: kept })
    },
    handler: async (request) => {
      const payload = conversationPayload<ConversationListRequest>(request.payload);
      return { ok: true, payload: { conversations: await listConversationsForRequest(service, request.scope.domainId, payload) } };
    }
  });

  // The thread a person starts. Core opens a thread by itself the first time a
  // run, a build or a node has something to say, but until a person could open
  // one there was nothing to say anything *into*: the composer had no
  // conversation to append to and `append-turn` refuses an unknown thread. So
  // the chat window could be spoken to and never spoken from.
  //
  // `programs.write` and `authoring`, exactly as `append-turn` is. Opening a
  // thread removes nothing and acts nowhere outside, so it must not take a PIN
  // -- only a real-world delete or a payment asks a person, and starting a
  // conversation is neither.
  //
  // A subject the caller does not name falls back to the project itself, which
  // is what a person opening the chat with nothing selected is talking about.
  // Refusing them a thread for want of a subject would be the product declining
  // to do the thing it was asked for.
  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.openConversation,
    permission: "programs.write",
    classification: "authoring",
    action: "studio:OpenConversation",
    accessLevel: "Write",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = conversationPayload<ConversationOpenRequest>(request.payload);
      const projectId = String(payload.projectId ?? "");
      await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      const conversation = await conversations().openConversation({
        projectId,
        subject: requestedSubject(payload.subjectKind, payload.subjectId) ?? { kind: "project", id: projectId },
        title: typeof payload.title === "string" && payload.title ? payload.title : null
      });
      return { ok: true, payload: { conversation } };
    }
  });

  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getConversation,
    permission: "programs.read",
    classification: "read",
    action: "studio:GetConversation",
    accessLevel: "Read",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = conversationPayload<ConversationReadRequest>(request.payload);
      const projectId = String(payload.projectId ?? "");
      await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      const conversation = await conversations().getConversation({
        projectId,
        conversationId: String(payload.conversationId ?? ""),
        sinceTurnId: typeof payload.sinceTurnId === "string" ? payload.sinceTurnId : undefined,
        limit: payload.limit
      });
      return { ok: true, payload: { conversation } };
    }
  });

  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.appendConversationTurn,
    permission: "programs.write",
    classification: "authoring",
    action: "studio:AppendTurn",
    accessLevel: "Write",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = conversationPayload<ConversationTurnAppendRequest>(request.payload);
      const projectId = String(payload.projectId ?? "");
      await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      return { ok: true, payload: await appendConversationTurnForRequest(dependencies, request, projectId, payload) };
    }
  });

  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.answerConversationAsk,
    permission: "programs.write",
    classification: "authoring",
    action: "studio:AnswerAsk",
    accessLevel: "Write",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = conversationPayload<ConversationAnswerRequest>(request.payload);
      const projectId = String(payload.projectId ?? "");
      await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      return { ok: true, payload: await answerConversationAskForRequest(dependencies, request, projectId, payload) };
    }
  });

  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getConversationAttachment,
    permission: "programs.read",
    classification: "read",
    action: "studio:GetConversationAttachment",
    accessLevel: "Read",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = conversationPayload<ConversationAttachmentRequest>(request.payload);
      const projectId = String(payload.projectId ?? "");
      await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      const attachment = await conversations().getAttachment({
        projectId,
        conversationId: String(payload.conversationId ?? ""),
        turnId: String(payload.turnId ?? "")
      });
      return { ok: true, payload: { attachment } };
    }
  });
}

function conversationPayload<TRequest>(payload: unknown): Partial<TRequest> {
  return payload && typeof payload === "object" ? (payload as Partial<TRequest>) : {};
}
