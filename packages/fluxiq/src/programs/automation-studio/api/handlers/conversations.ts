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
// `programs.write` and is `authoring`, not `destructive`, because most answers
// commit nothing and a refusal never does. No answer to a permission ask or to
// a question a run waits on takes a PIN: it is a step inside a Flow or a chat,
// and the person's press stands, signed in or paired. The one exception is a
// `panel-command.` confirmation, a one-off command from chat whose PIN is
// checked here before the answer is written so a wrong one leaves it waiting
// (`runtime/conversations/panel-command-pin.ts`). A paired client has no PIN to
// give and never runs those.
//
// This module registers against its own dependency record rather than
// `AutomationStudioApiDependencies`: it needs the domain-scope check, the
// caller's project entitlement and the collaborator that holds the store, and
// naming those three is what lets a test register these endpoints without a
// service. `register.ts` builds the record from the service's `conversations`
// field in one line.

import { getConversationInput, listConversationsInput } from "@fluxiq/contracts/program-api-inputs";
import { authorizeProgramPin, type ProgramPinAuthorizationPayload } from "../../../_shared/authorization.ts";
import { endpointResource } from "../../../_shared/iam/index.ts";
import type { IdentityAccessService } from "../../../identity-access/index.ts";
import { AUTOMATION_STUDIO_ENDPOINTS, type ConversationAnswerRequest, type ConversationAttachmentRequest, type ConversationListRequest, type ConversationOpenRequest, type ConversationReadRequest, type ConversationTurnAppendRequest } from "../../../../api-contracts/automation.ts";
import type { GlobalProgramApiRegistry } from "../../../_shared/api.ts";
import type { AutomationStudioConversations } from "../../../../framework/automation-service/index.ts";
import {
  automationStudioPanelCommandAnswerNeedsPin,
  automationStudioConversationAttachmentResolver,
  type AutomationStudioConversationAttachmentReads
} from "../../../../runtime/conversations/index.ts";
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
  readonly service: AutomationStudioConversationRequestService & AutomationStudioConversationAttachmentReads;
  /** What checks the PIN on an answer that needs one. Absent, such an answer is refused, as a destructive endpoint is. */
  readonly identityAccess?: IdentityAccessService | undefined;
};

export function registerAutomationStudioConversationEndpoints(dependencies: AutomationStudioConversationApiDependencies): void {
  const { registry, service } = dependencies;
  const conversations = (): AutomationStudioConversations => service.conversations;
  const resolveAttachment = automationStudioConversationAttachmentResolver(service);

  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listConversations,
    assistant: { input: listConversationsInput, summary: "Lists the conversation threads in a project.", phrases: ["show my past chats", "list my conversations"], contextArgs: { projectId: "projectId" } },
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
    assistant: { hidden: "The chat panel opens a thread by itself when a person starts typing." },
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
    assistant: { input: getConversationInput, summary: "Reads one conversation thread.", phrases: ["show me that conversation", "what was said in this chat"], contextArgs: { projectId: "projectId" } },
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
    assistant: { hidden: "This is how the chat panel sends what a person types, so the assistant is already in the middle of it." },
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
    assistant: { hidden: "A question a thread is waiting on is answered with the panel's own buttons, never by the assistant on the person's behalf." },
    permission: "programs.write",
    classification: "authoring",
    action: "studio:AnswerAsk",
    accessLevel: "Write",
    resource: endpointResource.project(),
    handler: async (request) => {
      const payload = conversationPayload<ConversationAnswerRequest>(request.payload);
      const projectId = String(payload.projectId ?? "");
      await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      if (request.actor?.channel !== "paired-client") await authorizeAnswer(dependencies, projectId, payload);
      return { ok: true, payload: await answerConversationAskForRequest(dependencies, request, projectId, payload) };
    }
  });

  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getConversationAttachment,
    assistant: { hidden: "The chat panel fetches a turn's attachment to draw it; a person does not ask for it in words." },
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
      }, resolveAttachment);
      return { ok: true, payload: { attachment } };
    }
  });
}

/** Checks the PIN of an answer that is the person's authority for an act. One already settled commits nothing, so a resend is not asked again. */
async function authorizeAnswer(dependencies: AutomationStudioConversationApiDependencies, projectId: string, payload: Partial<ConversationAnswerRequest>): Promise<void> {
  const ask = await dependencies.service.conversations.getAsk({ projectId, askId: String(payload.askId ?? "") });
  if (ask?.status !== "pending" || !automationStudioPanelCommandAnswerNeedsPin(ask, String(payload.kind ?? ""))) return;
  await authorizeProgramPin(dependencies.identityAccess, payload as ProgramPinAuthorizationPayload);
}

function conversationPayload<TRequest>(payload: unknown): Partial<TRequest> {
  return payload && typeof payload === "object" ? (payload as Partial<TRequest>) : {};
}
