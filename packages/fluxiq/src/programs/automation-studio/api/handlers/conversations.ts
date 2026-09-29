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

import { AUTOMATION_STUDIO_ENDPOINTS, type ConversationAnswerRequest, type ConversationAttachmentRequest, type ConversationListRequest, type ConversationOpenRequest, type ConversationReadRequest, type ConversationTurnAppendRequest } from "../contracts.ts";
import type { GlobalProgramApiRegistry } from "../../../_shared/api.ts";
import { automationStudioPageLimit } from "../../storage/index.ts";
import {
  parseAutomationStudioPanelCapabilities,
  type AutomationStudioConversationFlowReference,
  type AutomationStudioConversationOnScreen
} from "../../runtime/index.ts";
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
  readonly service: {
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
};

export function registerAutomationStudioConversationEndpoints(dependencies: AutomationStudioConversationApiDependencies): void {
  const { registry, service } = dependencies;
  const conversations = (): AutomationStudioConversations => service.conversations;

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
        return { ok: true, payload: { conversations: await conversations().listConversations({ projectId, ...narrow }) } };
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
        found.push(...await conversations().listConversations({ projectId: project.id, ...narrow, limit: limit - found.length }));
      }
      return { ok: true, payload: { conversations: found.slice(0, limit) } };
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
    handler: async (request) => {
      const payload = conversationPayload<ConversationTurnAppendRequest>(request.payload);
      const projectId = String(payload.projectId ?? "");
      await service.assertProjectDomainAccess(projectId, request.scope.domainId);
      const personTurn = {
        projectId,
        conversationId: String(payload.conversationId ?? ""),
        text: String(payload.text ?? ""),
        actorId: request.actor?.userId,
        attachment: requestedAttachment(payload.attachmentKind, payload.attachmentRef)
      };
      // With the panel's vocabulary, the turn is an instruction as well as a
      // record: Core reads it, decides, and writes the answer into the thread.
      if (Array.isArray(payload.capabilities)) {
        const answer = await conversations().respondToPersonTurn({
          ...personTurn,
          capabilities: parseAutomationStudioPanelCapabilities(payload.capabilities),
          flows: await projectFlows(service, projectId),
          onScreen: requestedOnScreen(payload.onScreen),
          caller: request.actor ? { userId: request.actor.userId, sessionId: request.actor.sessionId } : null
        });
        return { ok: true, payload: { turn: answer.turn, response: answer.response, problem: answer.problem } };
      }
      const turn = await conversations().appendTurn(personTurn);
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
      const ask = await conversations().answerAsk({
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
      const attachment = await conversations().getAttachment({
        projectId,
        conversationId: String(payload.conversationId ?? ""),
        turnId: String(payload.turnId ?? "")
      });
      return { ok: true, payload: { attachment } };
    }
  });
}

/**
 * The project's Flows by name, or null when they could not be listed. Null is
 * not an empty project: the model is told the list is missing and passes a
 * named Flow on as written, so a failed listing costs the person a lookup, not
 * their instruction.
 */
async function projectFlows(service: AutomationStudioConversationApiDependencies["service"], projectId: string): Promise<AutomationStudioConversationFlowReference[] | null> {
  if (!service.listFlows) return null;
  try {
    const entries = await service.listFlows(projectId);
    return entries.map((entry) => ({ flowId: entry.flow.flowId, name: entry.flow.name || entry.flow.flowId }));
  } catch (error) {
    if (error instanceof Error && /domain scope|unavailable/iu.test(error.message)) throw error;
    return null;
  }
}

/** What the panel has open. Anything that is not a non-empty string is left out rather than refused. */
function requestedOnScreen(value: unknown): AutomationStudioConversationOnScreen {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const onScreen: AutomationStudioConversationOnScreen = {};
  for (const key of ["flowId", "subflowId", "runId", "recordingId"] as const) {
    const entry = record[key];
    if (typeof entry === "string" && entry.trim()) onScreen[key] = entry.trim();
  }
  return onScreen;
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
