// @fluxiq-test-group real-sql
// Every chat belongs to a project (t1095), so the panel's chat in a project keeps what the panel assistant
// thread had, through the assistant's own machinery: its loop over program tools, its Allow cards, its
// per-message allowance and the page selection the message was written on. Against the real registry,
// Identity Access, IAM audit and press grants, with a scripted model; the project's conversations are an
// in-memory stand-in with the collaborator's shape (the person's panel database is real, for card calls).
//
// - a handed-over message runs the loop into the project's thread, with the selection kept on the person's turn;
// - a card is raised there; only its raiser may Allow it, once; a paired client and anyone else are refused;
// - the per-message allowance stops the work;
// - a paired client cannot hand a message over, and is never offered the hand-off.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { deleteFlowInput, updateFlowSettingsInput } from "@fluxiq/contracts/program-api-inputs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryIamAuditSink } from "../../../../../platform/iam/index.ts";
import type { PanelAssistant, PanelAssistantModel, PanelAssistantProjectConversations } from "../../../../../runtime/conversations/assistant/index.ts";
import type { AutomationStudioConversationAsk, AutomationStudioConversationTurn } from "../../../../../runtime/conversations/index.ts";
import type { ConversationTurnAppendRequest } from "../../../../../api-contracts/automation.ts";
import { GlobalProgramApiRegistry, type ProgramApiActor, type ProgramApiHandler, type ProgramApiRequest } from "../../../../_shared/api.ts";
import { endpointResource } from "../../../../_shared/iam/index.ts";
import { PressGrantStore } from "../../../../_shared/press-grant/index.ts";
import { IdentityAccessService, type Permission } from "../../../../identity-access/index.ts";
import { PANEL_ASSISTANT_PROJECT_ENDPOINTS } from "../endpoints.ts";
import { panelAssistantOf } from "../panel-assistant-of.ts";
import { panelAssistantProjectChat } from "../project-chat.ts";
import { registerPanelAssistantEndpoints } from "../register.ts";

const PASSWORD = "a-long-test-password";
const lowCost = { passwordKdf: { testOnlyWeakParameters: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } } } as const;
const PROJECT = "p.1";
const THREAD = "conversation.c1";
const NO_PROJECT_READS = { getFlowBootstrapAdaptation: unused, getFlow: unused, assertProjectDomainAccess: unused };

async function unused(): Promise<never> {
  throw new Error("Not read in these cases.");
}

/** A project's conversations with the collaborator's shape, held in memory. */
function projectConversations() {
  const turns: AutomationStudioConversationTurn[] = [];
  let next = 0;
  const add = (turn: Omit<AutomationStudioConversationTurn, "turnId" | "ordinal" | "createdAt" | "decision"> & { turnId?: string }): AutomationStudioConversationTurn => {
    next += 1;
    const stored = { ordinal: next, createdAt: next, decision: null, ...turn, turnId: turn.turnId ?? `turn.${next}` } as AutomationStudioConversationTurn;
    turns.push(stored);
    return stored;
  };
  const askOf = (askId: string) => turns.find((turn) => turn.ask?.askId === askId)?.ask ?? null;
  const conversations: PanelAssistantProjectConversations = {
    appendTurn: async (input) => add({ conversationId: input.conversationId, author: "person", text: input.text, actorId: input.actorId ?? null, ask: null, attachment: input.attachment ?? null }),
    appendAutomationTurn: async (input) => add({ conversationId: input.conversationId, author: "automation", text: input.text, actorId: null, attachment: input.attachment, ask: input.ask ? ({ ...input.ask, conversationId: input.conversationId, status: "pending" } as unknown as AutomationStudioConversationAsk) : null }),
    recentTurns: async (input) => turns.filter((turn) => turn.conversationId === input.conversationId).slice(-input.count),
    getAsk: async (input) => askOf(input.askId),
    answerAsk: async (input) => {
      const ask = askOf(input.askId) as (AutomationStudioConversationAsk & { status: string; answer?: string }) | null;
      if (!ask) throw new Error("That question does not exist.");
      if (ask.status !== "pending") {
        if (ask.answer !== input.kind) throw new Error("This question has already been answered.");
        return ask;
      }
      Object.assign(ask, { status: "answered", answer: input.kind });
      return ask;
    }
  };
  return { turns, add, conversations, said: () => turns.map((turn) => turn.text) };
}

let rootDir = "";
let current: PanelAssistant<ProgramApiActor> | undefined;

async function setup(decisions: readonly unknown[], costUsd = 0.001) {
  const identityAccess = new IdentityAccessService(lowCost);
  await identityAccess.setPassword("admin", PASSWORD);
  const registry = new GlobalProgramApiRegistry({ identityAccess, pressGrants: new PressGrantStore(), iam: { audit: new MemoryIamAuditSink() } });
  const handlers = {
    rename: vi.fn<ProgramApiHandler>(async () => ({ ok: true, payload: { renamed: true } })),
    delete: vi.fn<ProgramApiHandler>(async () => ({ ok: true, payload: { deleted: true } })),
    getFlow: vi.fn<ProgramApiHandler>(async () => ({ ok: true, payload: { flow: { name: "Old search" } } }))
  };
  registry.register({ programId: "automation-studio", endpoint: "get-flow", permission: "programs.read", classification: "read", resource: endpointResource.projectChild("flow", "flowId"), assistant: { hidden: "Names a Flow." }, handler: handlers.getFlow });
  registry.register({ programId: "automation-studio", endpoint: "rename-flow", permission: "flows.write", classification: "authoring", assistant: { input: updateFlowSettingsInput, summary: "Renames a Flow.", contextArgs: { projectId: "projectId", flowId: "flowId" } }, handler: handlers.rename });
  registry.register({ programId: "automation-studio", endpoint: "delete-flow", permission: "flows.write", classification: "destructive", resource: endpointResource.projectChild("flow", "flowId"), assistant: { input: deleteFlowInput, summary: "Deletes a Flow.", contextArgs: { projectId: "projectId", flowId: "flowId" } }, handler: handlers.delete });
  const project = projectConversations();
  const assistant = registerPanelAssistantEndpoints({
    registry,
    service: { projectPaths: { root: path.join(rootDir, "programs", "automation-studio", "projects") }, conversations: { signals: { signal: () => undefined }, ...project.conversations }, ...NO_PROJECT_READS }
  });
  current = assistant;
  let asked = 0;
  const model: PanelAssistantModel = { name: "scripted", decide: async () => ({ decision: decisions[asked++] ?? { reply: "Done." }, costUsd }) };
  panelAssistantOf(registry)!.bindModelSource(async () => ({ ok: true, model }));
  const login = await identityAccess.authenticate({ username: "admin", password: PASSWORD });
  const person: ProgramApiActor = { sessionId: login.session.id, userId: login.user.id, roleId: login.role.id, permissions: [...login.role.permissions] as Permission[], channel: "panel" };
  const call = <T = Record<string, unknown>>(endpoint: string, payload: Record<string, unknown>, actor: ProgramApiActor = person) =>
    registry.call<Record<string, unknown>, T>({ programId: "automation-studio", endpoint, scope: {}, actor, payload });
  /** The person writes in the project's thread, with what they had open, and Core answers it. */
  const writes = (text: string, onScreen?: unknown): string => {
    project.add({ conversationId: THREAD, author: "person", text, actorId: person.userId, ask: null, attachment: onScreen === undefined ? null : { kind: "panel.on-screen", ref: Buffer.from(JSON.stringify(onScreen)).toString("base64url") } });
    return project.add({ conversationId: THREAD, author: "automation", text: "I'll work on that with the panel's own tools here.", actorId: null, ask: null, attachment: null }).turnId;
  };
  const handOver = (answerTurnId: string, actor: ProgramApiActor = person) => call<{ ending: string; spentUsd: number }>(PANEL_ASSISTANT_PROJECT_ENDPOINTS.workInProjectThread, { projectId: PROJECT, conversationId: THREAD, answerTurnId }, actor);
  const chat = panelAssistantProjectChat(registry, NO_PROJECT_READS);
  const request = (actor: ProgramApiActor): ProgramApiRequest => ({ programId: "automation-studio", endpoint: "answer-ask", scope: {}, actor, payload: {} });
  return { registry, assistant, handlers, person, call, project, writes, handOver, chat, request };
}

describe("the panel's chat in a project, handing a message to the panel assistant", () => {
  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-panel-project-chat-"));
  });

  afterEach(async () => {
    await current?.close();
    current = undefined;
    await rm(rootDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  it("runs the assistant's loop into the project's thread, with the selection kept on the person's turn and the thread's own project", async () => {
    const s = await setup([{ tool: "call_tool", input: { name: "automation-studio__rename-flow", input: { flow: { name: "Cheapest listings" } } }, why: "you asked" }, { reply: "Renamed." }]);
    const answer = s.writes("rename this flow to Cheapest listings", { page: "flows", selection: { projectId: "p.other", flowId: "flow.old" } });
    expect(await s.handOver(answer)).toMatchObject({ ok: true, payload: { ending: "replied" } });
    expect(s.handlers.rename).toHaveBeenCalledTimes(1);
    expect(s.handlers.rename.mock.calls[0]![0].payload).toEqual({ flow: { name: "Cheapest listings" }, projectId: PROJECT, flowId: "flow.old" });
    expect(s.project.said().slice(2)).toEqual(["**Renaming a Flow** — you asked. Done.", "Renamed."]);
  });

  it("raises an Allow card in the project's thread that only its raiser may answer, once; a paired client is sent to the panel", async () => {
    const deletion = { tool: "automation-studio__delete-flow", input: { projectId: PROJECT, flowId: "flow.old" }, why: "it looks unused" };
    const s = await setup([deletion, { reply: "Deleted it." }]);
    await s.handOver(s.writes("clean things up", { page: "flows" }));
    expect(s.handlers.delete).not.toHaveBeenCalled();
    const card = s.project.turns.at(-1)!.ask!;
    expect(card.askId.startsWith("ask.assistant.")).toBe(true);
    expect(card).toMatchObject({ kind: "confirm", status: "pending" });

    const someoneElse: ProgramApiActor = { ...s.person, userId: "user.someone-else" };
    await expect(s.chat.answer(s.request(someoneElse), PROJECT, { askId: card.askId, kind: "grant" })).rejects.toThrow("Only the person whose message raised this question can answer it.");
    await expect(s.chat.answer(s.request({ ...s.person, channel: "paired-client" }), PROJECT, { askId: card.askId, kind: "grant" })).rejects.toThrow("Answer it in the FluxIQ panel.");
    expect(card).toMatchObject({ status: "pending" });

    expect(await s.chat.answer(s.request(s.person), PROJECT, { askId: card.askId, kind: "grant" })).toMatchObject({ ask: { status: "answered" } });
    await s.assistant.idle();
    expect(s.handlers.delete).toHaveBeenCalledTimes(1);
    await s.chat.answer(s.request(s.person), PROJECT, { askId: card.askId, kind: "grant" });
    await s.assistant.idle();
    expect(s.handlers.delete).toHaveBeenCalledTimes(1);
    expect(s.project.said().slice(-2)).toEqual(["**Deleting a Flow** — You allowed it. Done.", "Deleted it."]);
    // Any other ask in the thread is not the assistant's: it is answered as before.
    expect(await s.chat.answer(s.request(s.person), PROJECT, { askId: "ask.other", kind: "grant" })).toBeUndefined();
  });

  it("stops at the message's spending allowance", async () => {
    const s = await setup([{ tool: "find_tools", input: { query: "anything" }, why: "to look" }, { tool: "find_tools", input: { query: "more" }, why: "to look again" }], 0.3);
    expect(await s.handOver(s.writes("look around"))).toMatchObject({ ok: true, payload: { ending: "allowance" } });
  });

  it("refuses a paired client's hand-over, and never offers one the hand-off", async () => {
    const s = await setup([]);
    const paired: ProgramApiActor = { ...s.person, channel: "paired-client" };
    expect(await s.handOver(s.writes("hi"), paired)).toEqual({ ok: false, error: "The assistant is used from the FluxIQ panel.", errorCode: "authorization.forbidden" });
    const vocabulary = [{ id: "flow.createHere" }];
    expect(s.chat.vocabulary(s.request(paired), { capabilities: vocabulary } as unknown as Partial<ConversationTurnAppendRequest>).capabilities).toEqual(vocabulary);
    const offered = s.chat.vocabulary(s.request(s.person), { capabilities: vocabulary } as unknown as Partial<ConversationTurnAppendRequest>).capabilities as Array<{ id: string }>;
    expect(offered.map((capability) => capability.id)).toEqual(["flow.createHere", "panel.assistant"]);
    expect(s.chat.vocabulary(s.request(s.person), {})).toEqual({});
  });
});
