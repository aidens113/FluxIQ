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

import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { GlobalProgramApiRegistry } from "../../../../_shared/api.ts";

import { AUTOMATION_STUDIO_ENDPOINTS } from "../../contracts.ts";
import {
  automationStudioConversationCommandWork,
  automationStudioConversationEffectiveCaller,
  AutomationStudioConversations,
  AUTOMATION_STUDIO_CONVERSATION_COMMAND_ATTACHMENT,
  AUTOMATION_STUDIO_PANEL_CAPABILITY_RESULT_ATTACHMENT
} from "../../../runtime/index.ts";
import { AutomationStudioProjectDatabasePool } from "../../../storage/index.ts";
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
    callerFor: vi.fn((actor: { userId: string; sessionId: string }) => automationStudioConversationEffectiveCaller(actor, () => "session.unlocked")),
    getAsk: vi.fn().mockResolvedValue(null),
    getTurn: vi.fn().mockResolvedValue(null),
    pendingAsks: vi.fn().mockResolvedValue([]),
    appendAutomationTurn: vi.fn().mockResolvedValue({ turnId: "turn.result" }),
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
    // Nothing Core runs was chosen, so `execution` is null and the client runs what it chose.
    expect(response).toEqual({ ok: true, payload: { turn: { turnId: "turn.1" }, response: { runNow: true, execution: null }, problem: null } });
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

  // Core runs the capabilities it owns itself, for whichever client asked. A
  // paired client acts as its person, whose unlocked session pays for the
  // model and is the session every call runs under; permissions stay its own.
  it("runs a capability Core owns for a paired client, under its person's unlocked session, and answers what came of it", async () => {
    const describeDecision = {
      decision: { kind: "invoke", say: null, invocation: { capabilityId: "flow.describe", title: "Say what a Flow should do", arguments: { flowId: "flow.kettle", instruction: "Check prices" }, confidence: 1, requestedId: null, renamedArguments: {}, droppedArguments: [], asksFirst: false, consequences: [] } },
      source: "model", modelProblem: null, attempts: 1, turnId: "turn.2", askId: null, runNow: true
    };
    const { registry, conversations } = conversationApi({ respondToPersonTurn: vi.fn().mockResolvedValue({ turn: { turnId: "turn.1" }, response: describeDecision, problem: null }) });
    const saved: Array<{ actor: unknown; payload: unknown }> = [];
    registry.register({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.saveFlowGenerationInstruction, permission: "flows.write", classification: "authoring", handler: (request) => { saved.push({ actor: request.actor, payload: request.payload }); return { ok: true, payload: {} }; } });
    const paired = { sessionId: "client-gateway:gateway.7", userId: "user.writer", roleId: "admin", permissions: ["programs.read" as const, "programs.write" as const, "flows.write" as const] };

    const response = await registry.call<unknown, { response: { execution: unknown } }>({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.appendConversationTurn,
      scope: { domainId: null },
      actor: paired,
      payload: { projectId: "project.one", conversationId: "conversation.one", text: "it should check prices", capabilities: [{ id: "flow.describe" }], onScreen: { pageUrl: "https://shop.example/kettles?q=blue" } }
    });

    const request = conversations.respondToPersonTurn.mock.calls[0]?.[0];
    expect(request.caller).toEqual({ userId: "user.writer", sessionId: "session.unlocked" });
    // The client sent the id alone; the model is shown Core's own descriptor.
    expect(request.capabilities[0].arguments.map((argument: { name: string }) => argument.name)).toEqual(["flowId", "instruction"]);
    expect(request.onScreen).toEqual({ pageUrl: "https://shop.example/kettles?q=blue" });
    expect(saved).toEqual([{ actor: { ...paired, sessionId: "session.unlocked" }, payload: { projectId: "project.one", flowId: "flow.kettle", authSessionId: "session.unlocked", instruction: "Check prices" } }]);
    expect(response.payload?.response.execution).toEqual({ capabilityId: "flow.describe", status: "done", summary: "Saved what this Flow should do.", flowId: "flow.kettle" });
    expect(conversations.appendAutomationTurn).toHaveBeenCalledWith(expect.objectContaining({ conversationId: "conversation.one", attachment: { kind: AUTOMATION_STUDIO_PANEL_CAPABILITY_RESULT_ATTACHMENT, ref: "flow.describe" } }));
  });

  it("keeps an address that is not a web page, or is too long, out of what is on screen", async () => {
    for (const pageUrl of ["javascript:alert(1)", "ftp://files.example/a", `https://shop.example/${"a".repeat(2_100)}`, "https://shop.example/a b", 42]) {
      const { registry, conversations } = conversationApi();
      await registry.call({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.appendConversationTurn,
        scope: { domainId: null },
        actor: writeActor,
        payload: { projectId: "project.one", conversationId: "conversation.one", text: "make one here", capabilities: [], onScreen: { pageUrl } }
      });
      expect(conversations.respondToPersonTurn.mock.calls[0]?.[0].onScreen, String(pageUrl).slice(0, 40)).toEqual({});
    }
  });

  it("applies the change a granted conversation-command question carries, and only the first time", async () => {
    const ref = Buffer.from(JSON.stringify({ capabilityId: "adaptation.apply", arguments: { flowId: "flow.kettle", adaptationId: "adaptation.9" } })).toString("base64url");
    const pending = { askId: "conversation-command.1", conversationId: "conversation.one", turnId: "turn.q", kind: "confirm", status: "pending", answer: null };
    const answered = { ...pending, status: "answered", answer: { kind: "grant" } };
    const { registry, conversations } = conversationApi({
      getAsk: vi.fn().mockResolvedValueOnce(pending).mockResolvedValueOnce(answered),
      answerAsk: vi.fn().mockResolvedValue(answered),
      getTurn: vi.fn().mockResolvedValue({ turnId: "turn.q", attachment: { kind: AUTOMATION_STUDIO_CONVERSATION_COMMAND_ATTACHMENT, ref } })
    });
    const reviews: unknown[] = [];
    registry.register({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.reviewFlowAdaptation, permission: "programs.write", classification: "authoring", handler: (request) => { reviews.push(request.payload); return { ok: true, payload: {} }; } });
    const grant = () => registry.call<unknown, { ask: unknown; execution?: unknown }>({
      programId: "automation-studio",
      endpoint: AUTOMATION_STUDIO_ENDPOINTS.answerConversationAsk,
      scope: { domainId: null },
      actor: writeActor,
      payload: { projectId: "project.one", askId: "conversation-command.1", kind: "grant" }
    });

    const first = await grant();
    expect(first.payload?.execution).toMatchObject({ capabilityId: "adaptation.apply", status: "done", flowId: "flow.kettle", adaptationId: "adaptation.9" });
    expect(conversations.getTurn).toHaveBeenCalledWith({ projectId: "project.one", conversationId: "conversation.one", turnId: "turn.q" });
    expect(reviews).toEqual([
      { projectId: "project.one", flowId: "flow.kettle", adaptationId: "adaptation.9", action: "approve" },
      { projectId: "project.one", flowId: "flow.kettle", adaptationId: "adaptation.9", action: "apply" }
    ]);

    // A resend of the same answer replays it; nothing is applied twice.
    const second = await grant();
    expect(second.payload).toEqual({ ask: answered });
    expect(reviews).toHaveLength(2);
  });

  it("reads a thread about a Flow as that Flow, and runs it in the background for the client", async () => {
    const rootDir = path.join(process.cwd(), ".tmp", "automation-studio-conversation-endpoints-test");
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(rootDir, { recursive: true });
    const pool = new AutomationStudioProjectDatabasePool({ rootDir });
    try {
      const conversations = new AutomationStudioConversations(pool);
      const thread = await conversations.openConversation({ projectId: "project.one", subject: { kind: "flow", id: "flow.kettle" }, title: null });
      const registry = new GlobalProgramApiRegistry();
      registerAutomationStudioConversationEndpoints({
        registry,
        service: {
          assertProjectDomainAccess: vi.fn().mockResolvedValue(undefined),
          listProjects: vi.fn().mockResolvedValue({ projects: [] }),
          listFlows: vi.fn().mockResolvedValue([{ flow: { flowId: "flow.kettle", name: "Kettle price checker" } }, { flow: { flowId: "flow.toaster", name: "Toaster stock watch" } }]),
          conversations
        }
      });
      const runs: unknown[] = [];
      registry.register({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.runRuntimeSession, permission: "runtime.control", classification: "authoring", handler: (request) => { runs.push(request.payload); return { ok: true, payload: { runtimeSession: { runId: "run.1", status: "completed" }, terminalReason: "completed" } }; } });
      const runner = { ...writeActor, permissions: ["programs.write" as const, "runtime.control" as const] };

      const response = await registry.call<unknown, { response: { decision: { kind: string }; execution: { status: string } } }>({
        programId: "automation-studio",
        endpoint: AUTOMATION_STUDIO_ENDPOINTS.appendConversationTurn,
        scope: { domainId: null },
        actor: runner,
        payload: { projectId: "project.one", conversationId: thread.conversationId, text: "run it", capabilities: [{ id: "run.execute" }] }
      });
      expect(response.payload?.response.decision.kind).toBe("invoke");
      expect(response.payload?.response.execution.status).toBe("started");
      await automationStudioConversationCommandWork.idle();

      expect(runs).toEqual([{ projectId: "project.one", flowId: "flow.kettle" }]);
      const turns = (await conversations.getConversation({ projectId: "project.one", conversationId: thread.conversationId }))?.turns ?? [];
      expect(turns.map((turn) => turn.author)).toEqual(["person", "automation", "automation"]);
      expect(turns[2]).toMatchObject({ text: "The run run.1 ended completed.", attachment: { kind: AUTOMATION_STUDIO_PANEL_CAPABILITY_RESULT_ATTACHMENT, ref: "run.execute" } });
    } finally {
      await pool.closeAll();
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
