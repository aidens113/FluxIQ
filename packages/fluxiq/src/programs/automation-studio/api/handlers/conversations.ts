// The endpoints a person uses to talk to FluxIQ: the threads, one thread, what
// a turn shows, a turn they write, and the answer to an ask.
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
// `AutomationStudioApiDependencies`, because the service facade does not carry
// a `conversations` field yet. Wiring is one line in `register.ts` once it
// does; nothing else here changes.

import { AUTOMATION_STUDIO_ENDPOINTS, type ConversationAnswerRequest, type ConversationAttachmentRequest, type ConversationListRequest, type ConversationReadRequest, type ConversationTurnAppendRequest } from "../contracts.ts";
import type { GlobalProgramApiRegistry } from "../../../_shared/api.ts";
import { automationStudioPageLimit } from "../../storage/index.ts";
import {
  AUTOMATION_STUDIO_CONVERSATION_ANSWER_KINDS,
  isAutomationStudioConversationStatus,
  isAutomationStudioConversationSubjectKind,
  type AutomationStudioConversation,
  type AutomationStudioConversationAnswerKind,
  type AutomationStudioConversations,
  type AutomationStudioConversationStatus,
  type AutomationStudioConversationSubject
} from "../../runtime/index.ts";

/** What the conversation endpoints need: the registry, the domain-scope check, and the collaborator that holds the store. */
export type AutomationStudioConversationApiDependencies = {
  readonly registry: GlobalProgramApiRegistry;
  readonly service: {
    assertProjectDomainAccess(projectId: string, domainId?: string | null): Promise<void>;
    /** Exactly what the `projects` endpoint returns for a domain scope: the caller's entitlement, already decided. */
    listProjects(domainId?: string | null): Promise<{ projects: Array<{ id: string }> }>;
  };
  readonly conversations: AutomationStudioConversations;
};

export function registerAutomationStudioConversationEndpoints(dependencies: AutomationStudioConversationApiDependencies): void {
  const { registry, service, conversations } = dependencies;

  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.listConversations,
    permission: "programs.read",
    classification: "read",
    handler: async (request) => {
      const payload = conversationPayload<ConversationListRequest>(request.payload);
      const narrow = { subject: requestedSubject(payload.subjectKind, payload.subjectId), status: requestedStatus(payload.status), limit: payload.limit };
      if (payload.projectId !== null && payload.projectId !== undefined) {
        const projectId = String(payload.projectId);
        await service.assertProjectDomainAccess(projectId, request.scope.domainId);
        return { ok: true, payload: { conversations: await conversations.listConversations({ projectId, ...narrow }) } };
      }
      // Across every project the caller can see. `listProjects` is the same
      // entitlement the `projects` endpoint grants for this domain scope, so
      // there is one answer to "what may this caller see" rather than two, and
      // no per-project refusal to swallow: a project that is out of scope is
      // not in the list at all.
      const { projects } = await service.listProjects(request.scope.domainId);
      const limit = automationStudioPageLimit(payload.limit);
      const found: AutomationStudioConversation[] = [];
      for (const project of projects) {
        if (found.length >= limit) break;
        found.push(...await conversations.listConversations({ projectId: project.id, ...narrow, limit: limit - found.length }));
      }
      return { ok: true, payload: { conversations: found.slice(0, limit) } };
    }
  });

  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getConversation,
    permission: "programs.read",
    classification: "read",
    handler: async (request) => {
      const payload = conversationPayload<ConversationReadRequest>(request.payload);
      const projectId = String(payload.projectId ?? "");
      await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      const conversation = await conversations.getConversation({
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
    handler: async (request) => {
      const payload = conversationPayload<ConversationTurnAppendRequest>(request.payload);
      const projectId = String(payload.projectId ?? "");
      await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      const turn = await conversations.appendTurn({
        projectId,
        conversationId: String(payload.conversationId ?? ""),
        text: String(payload.text ?? ""),
        actorId: request.actor?.userId,
        attachment: requestedAttachment(payload.attachmentKind, payload.attachmentRef)
      });
      return { ok: true, payload: { turn } };
    }
  });

  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.answerConversationAsk,
    permission: "programs.write",
    classification: "authoring",
    handler: async (request) => {
      const payload = conversationPayload<ConversationAnswerRequest>(request.payload);
      const projectId = String(payload.projectId ?? "");
      await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      const ask = await conversations.answerAsk({
        projectId,
        askId: String(payload.askId ?? ""),
        kind: requiredAnswerKind(payload.kind),
        value: typeof payload.value === "string" ? payload.value : undefined,
        actorId: request.actor?.userId
      });
      return { ok: true, payload: { ask } };
    }
  });

  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getConversationAttachment,
    permission: "programs.read",
    classification: "read",
    handler: async (request) => {
      const payload = conversationPayload<ConversationAttachmentRequest>(request.payload);
      const projectId = String(payload.projectId ?? "");
      await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      const attachment = await conversations.getAttachment({
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

/** A subject is a kind and an id together; half of one narrows nothing and is refused rather than ignored. */
function requestedSubject(kind: unknown, id: unknown): AutomationStudioConversationSubject | undefined {
  if (kind === undefined && id === undefined) return undefined;
  if (!isAutomationStudioConversationSubjectKind(kind)) throw new Error("A conversation subject kind must be project, flow, build or run.");
  if (typeof id !== "string" || !id) throw new Error("A conversation subject needs an ID.");
  return { kind, id };
}

function requestedStatus(status: unknown): AutomationStudioConversationStatus | undefined {
  if (status === undefined) return undefined;
  if (!isAutomationStudioConversationStatus(status)) throw new Error("A conversation status is open or resolved.");
  return status;
}

function requestedAttachment(kind: unknown, ref: unknown): { kind: string; ref: string } | undefined {
  if (kind === undefined && ref === undefined) return undefined;
  if (typeof kind !== "string" || !kind || typeof ref !== "string" || !ref) throw new Error("A conversation attachment needs both a kind and a reference.");
  return { kind, ref };
}

function requiredAnswerKind(kind: unknown): AutomationStudioConversationAnswerKind {
  if (typeof kind !== "string" || !(AUTOMATION_STUDIO_CONVERSATION_ANSWER_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`An answer is one of: ${AUTOMATION_STUDIO_CONVERSATION_ANSWER_KINDS.join(", ")}.`);
  }
  return kind as AutomationStudioConversationAnswerKind;
}
