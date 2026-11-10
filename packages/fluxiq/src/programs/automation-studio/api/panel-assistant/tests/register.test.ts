// @fluxiq-test-group real-sql
// The panel assistant's endpoints against the real registry, Identity Access,
// IAM audit and press grants, with a scripted model. Only the clock-free
// handlers of a few stand-in tools are fakes.
//
// - a chain of three tools completes, each call audited `via: "assistant"`,
//   and no tool the model never called is decided or audited;
// - a tool the person may not use is refused at the call;
// - "delete Old search" runs at once, with a grant minted for exactly it;
// - "clean things up" gets an Allow card; Allow runs it once with a grant, a
//   second press runs nothing, and Don't runs nothing;
// - a paired client is refused.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { deleteFlowInput, getFlowInput, listFlowsInput, updateFlowSettingsInput } from "@fluxiq/contracts/program-api-inputs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryIamAuditSink } from "../../../../../platform/iam/index.ts";
import type { PanelAssistant, PanelAssistantModel } from "../../../../../runtime/conversations/assistant/index.ts";
import { GlobalProgramApiRegistry, type ProgramApiActor, type ProgramApiHandler } from "../../../../_shared/api.ts";
import { endpointResource } from "../../../../_shared/iam/index.ts";
import { PressGrantStore } from "../../../../_shared/press-grant/index.ts";
import { IdentityAccessService, type Permission } from "../../../../identity-access/index.ts";
import { PANEL_ASSISTANT_ENDPOINTS } from "../endpoints.ts";
import { panelAssistantOf } from "../panel-assistant-of.ts";
import { registerPanelAssistantEndpoints } from "../register.ts";

const PASSWORD = "a-long-test-password";
const lowCost = { passwordKdf: { testOnlyWeakParameters: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } } } as const;

type Setup = Awaited<ReturnType<typeof setup>>;

let rootDir = "";
/** The assistant the running case registered, closed after it. */
let current: PanelAssistant<ProgramApiActor> | undefined;

async function setup(decisions: readonly unknown[]) {
  const identityAccess = new IdentityAccessService(lowCost);
  await identityAccess.setPassword("admin", PASSWORD);
  const audit = new MemoryIamAuditSink();
  const registry = new GlobalProgramApiRegistry({ identityAccess, pressGrants: new PressGrantStore(), iam: { audit } });
  const handlers = {
    getFlow: vi.fn<ProgramApiHandler>(async (request) => ({ ok: true, payload: { flow: { id: (request.payload as { flowId: string }).flowId, name: (request.payload as { flowId: string }).flowId === "flow.old" ? "Old search" : "New search" } } })),
    rename: vi.fn<ProgramApiHandler>(async () => ({ ok: true, payload: { renamed: true } })),
    delete: vi.fn<ProgramApiHandler>(async (request) => ({ ok: true, payload: { deleted: (request.payload as { flowId: string }).flowId, grantSeen: (request as { pressGrant?: unknown }).pressGrant ?? null } })),
    purge: vi.fn<ProgramApiHandler>(async () => ({ ok: true }))
  };
  registry.register({ programId: "automation-studio", endpoint: "get-flow", permission: "programs.read", classification: "read", resource: endpointResource.projectChild("flow", "flowId"), assistant: { input: getFlowInput, summary: "Reads one Flow.", contextArgs: { projectId: "projectId", flowId: "flowId" } }, handler: handlers.getFlow });
  registry.register({ programId: "automation-studio", endpoint: "rename-flow", permission: "flows.write", classification: "authoring", assistant: { input: updateFlowSettingsInput, summary: "Renames a Flow.", contextArgs: { projectId: "projectId", flowId: "flowId" } }, handler: handlers.rename });
  registry.register({ programId: "automation-studio", endpoint: "delete-flow", permission: "flows.write", classification: "destructive", resource: endpointResource.projectChild("flow", "flowId"), assistant: { input: deleteFlowInput, summary: "Deletes a Flow.", contextArgs: { projectId: "projectId", flowId: "flowId" } }, handler: handlers.delete });
  registry.register({ programId: "automation-studio", endpoint: "purge-project-caches", permission: "secrets.manage", classification: "authoring", assistant: { input: listFlowsInput, summary: "Purges a project's caches.", contextArgs: { projectId: "projectId" } }, handler: handlers.purge });
  const assistant = registerPanelAssistantEndpoints({ registry, service: { projectPaths: { root: path.join(rootDir, "programs", "automation-studio", "projects") } } });
  const requests: unknown[] = [];
  const model: PanelAssistantModel = {
    name: "scripted",
    decide: async (request) => {
      requests.push(request);
      return { decision: decisions[requests.length - 1] ?? { reply: "Done." }, costUsd: 0.001 };
    }
  };
  panelAssistantOf(registry)!.bindModelSource(async () => ({ ok: true, model }));
  const login = await identityAccess.authenticate({ username: "admin", password: PASSWORD });
  const person: ProgramApiActor = { sessionId: login.session.id, userId: login.user.id, roleId: login.role.id, permissions: [...login.role.permissions] as Permission[], channel: "panel" };
  const call = <T = Record<string, unknown>>(endpoint: string, payload: Record<string, unknown>, actor: ProgramApiActor = person) =>
    registry.call<Record<string, unknown>, T>({ programId: "automation-studio", endpoint, scope: {}, actor, payload });
  const said = async (conversationId: string): Promise<string[]> => {
    const read = await call<{ conversation: { turns: Array<{ text: string }> } }>(PANEL_ASSISTANT_ENDPOINTS.getThread, { conversationId, limit: 200 });
    return read.payload!.conversation.turns.map((turn) => turn.text);
  };
  const lastAsk = async (conversationId: string): Promise<{ askId: string; kind: string; status: string }> => {
    const read = await call<{ conversation: { turns: Array<{ ask: { askId: string; kind: string; status: string } | null }> } }>(PANEL_ASSISTANT_ENDPOINTS.getThread, { conversationId, limit: 200 });
    return read.payload!.conversation.turns.at(-1)!.ask!;
  };
  current = assistant;
  return { registry, assistant, audit, handlers, person, call, said, lastAsk, requests };
}

/** Sends a message through the endpoint and waits for the work it started. */
async function send(s: Setup, text: string, extra: Record<string, unknown> = {}, actor?: ProgramApiActor): Promise<{ conversationId: string; response: Awaited<ReturnType<Setup["call"]>> }> {
  const response = await s.call<{ conversation: { conversationId: string } }>(PANEL_ASSISTANT_ENDPOINTS.send, { text, ...extra }, actor);
  await s.assistant.idle();
  return { conversationId: (response.payload as { conversation?: { conversationId: string } } | undefined)?.conversation?.conversationId ?? "", response };
}

describe("panel assistant endpoints", () => {
  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-panel-assistant-api-"));
  });

  afterEach(async () => {
    await current?.close();
    current = undefined;
    await rm(rootDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  it("answers the endpoint contract: open, send, list, read", async () => {
    const s = await setup([{ reply: "Hello." }]);
    const opened = await s.call<{ conversation: { conversationId: string; subject: unknown; projectId: string } }>(PANEL_ASSISTANT_ENDPOINTS.openThread, { title: "Planning" });
    expect(opened.ok).toBe(true);
    expect(opened.payload!.conversation).toMatchObject({ subject: { kind: "panel", id: "panel" }, projectId: "panel", title: "Planning" });
    const sent = await s.call<{ conversation: { conversationId: string }; turn: { author: string; text: string } }>(PANEL_ASSISTANT_ENDPOINTS.send, { conversationId: opened.payload!.conversation.conversationId, text: "hi", onScreen: { page: "home" } });
    expect(sent.payload).toMatchObject({ conversation: { conversationId: opened.payload!.conversation.conversationId }, turn: { author: "person", text: "hi" } });
    await s.assistant.idle();
    const listed = await s.call<{ conversations: Array<{ conversationId: string }> }>(PANEL_ASSISTANT_ENDPOINTS.listThreads, {});
    expect(listed.payload!.conversations.map((conversation) => conversation.conversationId)).toEqual([opened.payload!.conversation.conversationId]);
    expect(await s.said(opened.payload!.conversation.conversationId)).toEqual(["hi", "Hello."]);
    expect(await s.call(PANEL_ASSISTANT_ENDPOINTS.getAllowance, {})).toMatchObject({ ok: true, payload: { allowanceUsd: 0.5, chosen: false } });
    expect(await s.call(PANEL_ASSISTANT_ENDPOINTS.getThread, { conversationId: "conversation.nobodys" })).toMatchObject({ ok: false, error: "That conversation does not exist." });
  });

  it("completes a chain of three tools as the person, each call audited via the assistant, and decides nothing it did not call", async () => {
    const s = await setup([
      { tool: "find_tools", input: { query: "rename flow" }, why: "to find how" },
      { tool: "automation-studio__get-flow", input: {}, why: "to read it first" },
      { tool: "call_tool", input: { name: "automation-studio__rename-flow", input: { flow: { name: "Cheapest listings" } } }, why: "you asked" },
      { reply: "Renamed." }
    ]);
    const { conversationId } = await send(s, "rename this flow to Cheapest listings", { onScreen: { page: "flows", selection: { projectId: "p.1", flowId: "flow.old" } } });
    expect(s.handlers.getFlow).toHaveBeenCalled();
    expect(s.handlers.rename).toHaveBeenCalledTimes(1);
    expect(s.handlers.rename.mock.calls[0]![0].payload).toEqual({ flow: { name: "Cheapest listings" }, projectId: "p.1", flowId: "flow.old" });
    expect(await s.said(conversationId)).toEqual([
      "rename this flow to Cheapest listings",
      "**Looking for a way to do that** — to find how. Found 3 ways to go about it.",
      "**Reading one Flow** — to read it first. Done.",
      "**Renaming a Flow** — you asked. Done.",
      "Renamed."
    ]);
    const viaAssistant = s.audit.records.filter((record) => record.via === "assistant").map((record) => record.action);
    expect(viaAssistant).toContain("studio:RenameFlow");
    expect(s.audit.records.some((record) => record.action === "studio:DeleteFlow" || record.action === "studio:PurgeProjectCaches")).toBe(false);
  });

  it("refuses at the call a tool the person may not use", async () => {
    const s = await setup([{ tool: "automation-studio__purge-project-caches", input: { projectId: "p.1" }, why: "to free space" }, { reply: "I am not allowed to." }]);
    const limited: ProgramApiActor = { ...s.person, permissions: s.person.permissions.filter((permission) => permission !== "secrets.manage") };
    const { conversationId } = await send(s, "purge the caches", {}, limited);
    expect(s.handlers.purge).not.toHaveBeenCalled();
    expect((await s.said(conversationId))[1]).toBe("**Purging a project's caches** — to free space. It was not done: Permission required: secrets.manage.");
    expect(s.audit.records.find((record) => record.action === "studio:PurgeProjectCaches")).toMatchObject({ decision: "deny", via: "assistant" });
  });

  it("runs \"delete Old search\" at once, with a grant minted for exactly that call", async () => {
    const s = await setup([{ tool: "automation-studio__delete-flow", input: { projectId: "p.1", flowId: "flow.old" }, why: "you asked" }, { reply: "Deleted “Old search”." }]);
    const { conversationId } = await send(s, "delete Old search");
    expect(s.handlers.delete).toHaveBeenCalledTimes(1);
    expect(s.handlers.delete.mock.calls[0]![0].payload).toEqual({ projectId: "p.1", flowId: "flow.old" });
    expect(s.handlers.delete.mock.calls[0]![0].pressGrant).toBeUndefined();
    expect(await s.said(conversationId)).toEqual(["delete Old search", "**Deleting a Flow** — you asked. Done.", "Deleted “Old search”."]);
    expect(s.audit.records.filter((record) => record.action === "studio:DeleteFlow").map((record) => [record.decision, record.via ?? null])).toEqual([["allow", null], ["allow", "assistant"]]);
  });

  it("asks \"clean things up\" with an Allow card; Allow runs it once with a grant, and Don't runs nothing", async () => {
    const deletion = { tool: "automation-studio__delete-flow", input: { projectId: "p.1", flowId: "flow.old" }, why: "it looks unused" };
    const s = await setup([deletion, { reply: "Deleted it." }, { ...deletion, input: { projectId: "p.1", flowId: "flow.new" } }]);
    const { conversationId } = await send(s, "clean things up");
    expect(s.handlers.delete).not.toHaveBeenCalled();
    expect((await s.said(conversationId)).at(-1)).toBe("Delete the Flow “Old search”? It cannot be undone.");
    const card = await s.lastAsk(conversationId);
    expect(card).toMatchObject({ kind: "confirm", status: "pending" });

    expect(await s.call(PANEL_ASSISTANT_ENDPOINTS.answer, { askId: card.askId, kind: "grant" })).toMatchObject({ ok: true, payload: { ask: { status: "answered" } } });
    await s.assistant.idle();
    expect(s.handlers.delete).toHaveBeenCalledTimes(1);
    expect(s.handlers.delete.mock.calls[0]![0].payload).toEqual({ projectId: "p.1", flowId: "flow.old" });
    // A second press, or a retried request, runs nothing more.
    expect((await s.call(PANEL_ASSISTANT_ENDPOINTS.answer, { askId: card.askId, kind: "grant" })).ok).toBe(true);
    await s.assistant.idle();
    expect(s.handlers.delete).toHaveBeenCalledTimes(1);
    expect(await s.said(conversationId)).toEqual(["clean things up", "Delete the Flow “Old search”? It cannot be undone.", "**Deleting a Flow** — You allowed it. Done.", "Deleted it."]);

    await send(s, "and the other one", { conversationId });
    const second = await s.lastAsk(conversationId);
    expect((await s.said(conversationId)).at(-1)).toBe("Delete the Flow “New search”? It cannot be undone.");
    await s.call(PANEL_ASSISTANT_ENDPOINTS.answer, { askId: second.askId, kind: "deny" });
    await s.assistant.idle();
    expect(s.handlers.delete).toHaveBeenCalledTimes(1);
    expect((await s.said(conversationId)).at(-1)).toBe("OK, I did not do that.");
    expect(await s.call(PANEL_ASSISTANT_ENDPOINTS.answer, { askId: second.askId, kind: "grant" })).toMatchObject({ ok: false, error: "This question has already been answered." });
  });

  it("refuses a paired client, which keeps its own threads", async () => {
    const s = await setup([]);
    const paired: ProgramApiActor = { ...s.person, channel: "paired-client" };
    expect(await s.call(PANEL_ASSISTANT_ENDPOINTS.send, { text: "hi" }, paired)).toEqual({ ok: false, error: "The assistant is used from the FluxIQ panel.", errorCode: "authorization.forbidden" });
  });
});
