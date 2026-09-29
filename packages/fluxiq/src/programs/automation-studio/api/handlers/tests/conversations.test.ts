// Covers handlers/conversations.ts. The collaborator is stubbed: these cases
// pin the handler contract -- which permission and classification each
// endpoint carries, that the project's domain access is asserted before
// anything is read, and that a payload the collaborator could not make sense
// of is refused here rather than passed on.
//
// The endpoints are registered against their own dependency record because
// the service facade does not carry a `conversations` field yet. When it
// does, `register.ts` registers them with the rest and `domain-scope.test.ts`
// gains all of them in its `DOMAIN_SCOPED` list.

import { describe, expect, it, vi } from "vitest";

import { GlobalProgramApiRegistry } from "../../../../_shared/api.ts";

import { AUTOMATION_STUDIO_ENDPOINTS } from "../../contracts.ts";
import type { AutomationStudioConversations } from "../../../runtime/index.ts";
import { cacheActor } from "./test-actor.ts";
import { registerAutomationStudioConversationEndpoints } from "../conversations.ts";

const DOMAIN_REFUSED = "Automation Studio project is unavailable in this domain scope.";
const readActor = { ...cacheActor("user.reader"), permissions: ["programs.read" as const] };
const writeActor = { ...cacheActor("user.writer"), permissions: ["programs.write" as const] };

function conversationApi(overrides: Record<string, unknown> = {}) {
  const conversations = {
    listConversations: vi.fn().mockResolvedValue([]),
    openConversation: vi.fn().mockResolvedValue({ conversationId: "conversation.one" }),
    getConversation: vi.fn().mockResolvedValue(null),
    appendTurn: vi.fn().mockResolvedValue({ turnId: "turn.1" }),
    answerAsk: vi.fn().mockResolvedValue({ askId: "ask.1", status: "answered" }),
    getAttachment: vi.fn().mockResolvedValue({ attachment: { kind: "run", ref: "run.17" }, payload: null }),
    respondToPersonTurn: vi.fn().mockResolvedValue({ turn: { turnId: "turn.1" }, response: { runNow: true }, problem: null }),
    ...overrides
  };
  const assertProjectDomainAccess = vi.fn().mockResolvedValue(undefined);
  const listProjects = vi.fn().mockResolvedValue({ projects: [{ id: "project.one" }, { id: "project.two" }] });
  const listFlows = vi.fn().mockResolvedValue([{ flow: { flowId: "flow.kettle", name: "Kettle price checker" } }]);
  const registry = new GlobalProgramApiRegistry();
  registerAutomationStudioConversationEndpoints({ registry, service: { assertProjectDomainAccess, listProjects, listFlows, conversations: conversations as unknown as AutomationStudioConversations } });
  return { registry, conversations, assertProjectDomainAccess, listProjects, listFlows };
}

// One representative call per endpoint, with the collaborator method it must reach.
const CONVERSATION_ENDPOINTS = [
  { endpoint: AUTOMATION_STUDIO_ENDPOINTS.listConversations, method: "listConversations", permission: "programs.read", classification: "read", actor: readActor, payload: { projectId: "project.one" } },
  { endpoint: AUTOMATION_STUDIO_ENDPOINTS.openConversation, method: "openConversation", permission: "programs.write", classification: "authoring", actor: writeActor, payload: { projectId: "project.one" } },
  { endpoint: AUTOMATION_STUDIO_ENDPOINTS.getConversation, method: "getConversation", permission: "programs.read", classification: "read", actor: readActor, payload: { projectId: "project.one", conversationId: "conversation.one" } },
  { endpoint: AUTOMATION_STUDIO_ENDPOINTS.appendConversationTurn, method: "appendTurn", permission: "programs.write", classification: "authoring", actor: writeActor, payload: { projectId: "project.one", conversationId: "conversation.one", text: "Go ahead." } },
  { endpoint: AUTOMATION_STUDIO_ENDPOINTS.answerConversationAsk, method: "answerAsk", permission: "programs.write", classification: "authoring", actor: writeActor, payload: { projectId: "project.one", askId: "ask.one", kind: "grant" } },
  { endpoint: AUTOMATION_STUDIO_ENDPOINTS.getConversationAttachment, method: "getAttachment", permission: "programs.read", classification: "read", actor: readActor, payload: { projectId: "project.one", conversationId: "conversation.one", turnId: "turn.one" } }
] as const;

describe("Automation Studio conversation API", () => {
  it("registers exactly the conversation endpoints, under their permission and classification", () => {
    const { registry } = conversationApi();
    expect(registry.endpoints()).toHaveLength(CONVERSATION_ENDPOINTS.length);
    for (const { endpoint, permission, classification } of CONVERSATION_ENDPOINTS) {
      expect(registry.endpoints()).toContainEqual({ programId: "automation-studio", endpoint, permission, classification });
    }
  });

  it("asserts the project's domain access before reading anything, on every endpoint", async () => {
    for (const { endpoint, method, actor, payload } of CONVERSATION_ENDPOINTS) {
      const { registry, conversations, assertProjectDomainAccess } = conversationApi();
      assertProjectDomainAccess.mockRejectedValueOnce(new Error(DOMAIN_REFUSED));
      const response = await registry.call({ programId: "automation-studio", endpoint, scope: { domainId: "other-domain" }, actor, payload });
      expect(response, endpoint).toEqual({ ok: false, error: DOMAIN_REFUSED });
      expect(assertProjectDomainAccess, endpoint).toHaveBeenCalledWith("project.one", "other-domain");
      expect(conversations[method as keyof typeof conversations], endpoint).not.toHaveBeenCalled();
    }
  });

  it("reaches its collaborator method once the scope is allowed", async () => {
    for (const { endpoint, method, actor, payload } of CONVERSATION_ENDPOINTS) {
      const { registry, conversations } = conversationApi();
      const response = await registry.call({ programId: "automation-studio", endpoint, scope: { domainId: null }, actor, payload });
      expect(response.ok, endpoint).toBe(true);
      expect(conversations[method as keyof typeof conversations], endpoint).toHaveBeenCalledTimes(1);
    }
  });

  it("refuses a caller whose permission does not cover writing a turn or answering", async () => {
    const { registry, conversations } = conversationApi();
    for (const endpoint of [AUTOMATION_STUDIO_ENDPOINTS.appendConversationTurn, AUTOMATION_STUDIO_ENDPOINTS.answerConversationAsk]) {
      const response = await registry.call({ programId: "automation-studio", endpoint, scope: { domainId: null }, actor: readActor, payload: { projectId: "project.one" } });
      expect(response.errorCode, endpoint).toBe("authorization.forbidden");
    }
    expect(conversations.appendTurn).not.toHaveBeenCalled();
    expect(conversations.answerAsk).not.toHaveBeenCalled();
  });

  it("carries the person's own id onto the turn they write and the answer they give", async () => {
    const { registry, conversations } = conversationApi();
    await registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.appendConversationTurn,
      scope: { domainId: null },
      actor: writeActor,
      payload: { projectId: "project.one", conversationId: "conversation.one", text: "Go ahead.", attachmentKind: "run", attachmentRef: "run.17" }
    });
    expect(conversations.appendTurn).toHaveBeenCalledWith({ projectId: "project.one", conversationId: "conversation.one", text: "Go ahead.", actorId: "user.writer", attachment: { kind: "run", ref: "run.17" } });

    await registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.answerConversationAsk,
      scope: { domainId: null },
      actor: writeActor,
      payload: { projectId: "project.one", askId: "ask.one", kind: "choice", value: "second" }
    });
    expect(conversations.answerAsk).toHaveBeenCalledWith({ projectId: "project.one", askId: "ask.one", kind: "choice", value: "second", actorId: "user.writer" });
  });

  it("reads a thread from the turn the caller already holds", async () => {
    const { registry, conversations } = conversationApi();
    await registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.getConversation,
      scope: { domainId: null },
      actor: readActor,
      payload: { projectId: "project.one", conversationId: "conversation.one", sinceTurnId: "turn.4", limit: 10 }
    });
    expect(conversations.getConversation).toHaveBeenCalledWith({ projectId: "project.one", conversationId: "conversation.one", sinceTurnId: "turn.4", limit: 10 });
  });

  it("searches every project the caller can see when no project is named, and bounds the whole answer", async () => {
    const { registry, conversations, listProjects, assertProjectDomainAccess } = conversationApi({
      listConversations: vi.fn().mockImplementation((input: { projectId: string }) => Promise.resolve([{ conversationId: `conversation.${input.projectId}` }]))
    });
    const response = await registry.call<unknown, { conversations: Array<{ conversationId: string }> }>({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.listConversations,
      scope: { domainId: "domain.one" },
      actor: readActor,
      payload: { projectId: null, status: "open" }
    });
    expect(response.ok).toBe(true);
    expect(response.payload?.conversations.map((conversation) => conversation.conversationId)).toEqual(["conversation.project.one", "conversation.project.two"]);
    // The entitlement is the one `projects` already grants for this domain, so
    // nothing here decides a second time what the caller may see -- and there
    // is no per-project refusal to swallow.
    expect(listProjects).toHaveBeenCalledWith("domain.one");
    expect(assertProjectDomainAccess).not.toHaveBeenCalled();
  });

  it("stops searching projects once the limit is filled", async () => {
    const { registry, conversations } = conversationApi({
      listConversations: vi.fn().mockResolvedValue([{ conversationId: "conversation.a" }])
    });
    await registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.listConversations,
      scope: { domainId: null },
      actor: readActor,
      payload: { projectId: null, limit: 1 }
    });
    expect(conversations.listConversations).toHaveBeenCalledTimes(1);
  });

  // A person opening the chat with nothing selected is talking about the
  // project. Refusing them a thread for want of a subject would be the product
  // declining the thing it was asked for, so the project is the fallback -- and
  // a named subject is still carried through.
  it("starts a thread about the project when the person names no subject, and about what they do name", async () => {
    const { registry, conversations } = conversationApi();
    const start = (payload: Record<string, unknown>) =>
      registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.openConversation, scope: { domainId: null }, actor: writeActor, payload });

    expect((await start({ projectId: "project.one" })).ok).toBe(true);
    expect(conversations.openConversation).toHaveBeenCalledWith({ projectId: "project.one", subject: { kind: "project", id: "project.one" }, title: null });

    expect((await start({ projectId: "project.one", subjectKind: "flow", subjectId: "flow.7", title: "Why did this stop?" })).ok).toBe(true);
    expect(conversations.openConversation).toHaveBeenCalledWith({ projectId: "project.one", subject: { kind: "flow", id: "flow.7" }, title: "Why did this stop?" });
  });

  // Opening a thread removes nothing and acts nowhere outside it, so it must
  // not take a PIN. Only a real-world delete or a payment asks a person.
  it("lets a writer start a thread with no PIN, and refuses a reader", async () => {
    const { registry, conversations } = conversationApi();
    const call = (actor: typeof readActor | typeof writeActor) =>
      registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.openConversation, scope: { domainId: null }, actor, payload: { projectId: "project.one" } });
    expect((await call(writeActor)).ok).toBe(true);
    expect((await call(readActor)).errorCode).toBe("authorization.forbidden");
    expect(conversations.openConversation).toHaveBeenCalledTimes(1);
  });

  it("refuses a payload the collaborator could not make sense of, without calling it", async () => {
    const { registry, conversations } = conversationApi();
    const refusals = [
      { endpoint: AUTOMATION_STUDIO_ENDPOINTS.listConversations, actor: readActor, payload: { projectId: "project.one", subjectKind: "page" }, error: "A conversation subject kind must be project, flow, build or run." },
      { endpoint: AUTOMATION_STUDIO_ENDPOINTS.listConversations, actor: readActor, payload: { projectId: "project.one", subjectKind: "run" }, error: "A conversation subject needs an ID." },
      { endpoint: AUTOMATION_STUDIO_ENDPOINTS.listConversations, actor: readActor, payload: { projectId: "project.one", status: "closed" }, error: "A conversation status is open or resolved." },
      { endpoint: AUTOMATION_STUDIO_ENDPOINTS.answerConversationAsk, actor: writeActor, payload: { projectId: "project.one", askId: "ask.one", kind: "maybe" }, error: "An answer is one of: grant, deny, choice, text." },
      { endpoint: AUTOMATION_STUDIO_ENDPOINTS.appendConversationTurn, actor: writeActor, payload: { projectId: "project.one", conversationId: "conversation.one", text: "Hi.", attachmentKind: "run" }, error: "A conversation attachment needs both a kind and a reference." },
      { endpoint: AUTOMATION_STUDIO_ENDPOINTS.openConversation, actor: writeActor, payload: { projectId: "project.one", subjectKind: "page", subjectId: "page.one" }, error: "A conversation subject kind must be project, flow, build or run." }
    ];
    for (const { endpoint, actor, payload, error } of refusals) {
      const response = await registry.call({ programId: "automation-studio", endpoint, scope: { domainId: null }, actor, payload });
      expect(response, error).toEqual({ ok: false, error });
    }
    expect(conversations.listConversations).not.toHaveBeenCalled();
    expect(conversations.answerAsk).not.toHaveBeenCalled();
    expect(conversations.appendTurn).not.toHaveBeenCalled();
    expect(conversations.openConversation).not.toHaveBeenCalled();
  });

  it("reads a turn that carries the panel's vocabulary as an instruction, with the project's Flows and what is on screen", async () => {
    const { registry, conversations, listFlows } = conversationApi();
    const response = await registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.appendConversationTurn,
      scope: { domainId: null },
      actor: writeActor,
      payload: {
        projectId: "project.one",
        conversationId: "conversation.one",
        text: "run my kettle flow",
        capabilities: [{ id: "run.execute", consequences: ["create_new"] }, { id: "flow.delete", consequences: ["delete"] }, { title: "no id" }],
        onScreen: { flowId: "flow.kettle", runId: 7 }
      }
    });
    expect(response).toEqual({ ok: true, payload: { turn: { turnId: "turn.1" }, response: { runNow: true }, problem: null } });
    expect(conversations.appendTurn).not.toHaveBeenCalled();
    expect(listFlows).toHaveBeenCalledWith("project.one");
    const request = conversations.respondToPersonTurn.mock.calls[0]?.[0];
    expect(request).toMatchObject({ projectId: "project.one", conversationId: "conversation.one", text: "run my kettle flow", flows: [{ flowId: "flow.kettle", name: "Kettle price checker" }], onScreen: { flowId: "flow.kettle" } });
    // The vocabulary is parsed on the way in, and Core decides what re-authorizes.
    expect(request.capabilities.map((capability: { id: string; reauthorizes: boolean }) => [capability.id, capability.reauthorizes])).toEqual([["run.execute", false], ["flow.delete", true]]);
  });

  it("still reads the instruction when the Flows cannot be listed, telling the model they are missing", async () => {
    const { registry, conversations, listFlows } = conversationApi();
    listFlows.mockRejectedValueOnce(new Error("catalogue index is locked"));
    const response = await registry.call({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.appendConversationTurn,
      scope: { domainId: null },
      actor: writeActor,
      payload: { projectId: "project.one", conversationId: "conversation.one", text: "run it", capabilities: [] }
    });
    expect(response.ok).toBe(true);
    expect(conversations.respondToPersonTurn.mock.calls[0]?.[0]).toMatchObject({ flows: null, capabilities: [], onScreen: {} });
  });
});
