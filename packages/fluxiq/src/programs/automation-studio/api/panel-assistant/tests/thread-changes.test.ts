// @fluxiq-test-group real-sql
// `get-panel-thread-attachment`, `rename-panel-thread` and `delete-panel-thread`
// through the real registry, against real per-person panel databases:
//
// - a turn's attachment is read: a navigation from its own reference, a
//   proposed change in the project the request names, decided by IAM and the
//   domain scope there, and never without a project;
// - a rename checks the name before the thread, with the conversations' codes;
// - a delete removes the thread, its turns, its asks, its cards' waiting calls
//   and the records that carried them, and is refused while a message's work
//   still uses the thread;
// - under the `service` IAM profile one person never reads, renames or deletes
//   another's thread: it answers exactly as a thread that does not exist.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { IAM_POLICY_LANGUAGE_VERSION, parseIamPolicyDocument } from "@fluxiq/contracts/iam";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationStudioProjectDatabasePool } from "../../../../../framework/persistence/automation/index.ts";
import type { IamPolicy } from "../../../../../platform/iam/index.ts";
import type { AutomationStudioBootstrapAdaptation } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import { IAM_USER_ACCESS } from "../../../../../platform/iam/predefined/index.ts";
import { PANEL_ASSISTANT_CLIENT_ACTION_ATTACHMENT, panelAssistantDatabaseId, PanelAssistantThreads, type PanelAssistant, type PanelAssistantModel } from "../../../../../runtime/conversations/assistant/index.ts";
import { AUTOMATION_STUDIO_FLOW_GRAPH_DIFF_ATTACHMENT } from "../../../../../runtime/conversations/index.ts";
import { GlobalProgramApiRegistry, type ProgramApiActor, type ProgramApiResponse } from "../../../../_shared/api.ts";
import { actor, fixedPolicySource, registerPrefixOwners } from "../../../../_shared/tests/iam-registry-fixtures.ts";
import { PANEL_ASSISTANT_ENDPOINTS } from "../endpoints.ts";
import { panelAssistantOf } from "../panel-assistant-of.ts";
import type { PanelAssistantProjectReads } from "../project-attachments.ts";
import { registerPanelAssistantEndpoints } from "../register.ts";

const alice = actor("alice", "user", ["programs.read", "programs.write"]);
const bob = actor("bob", "user", ["programs.read", "programs.write"]);
const ALICES_PROJECT = "a-project.one";

/**
 * The panel actions on the caller's own user, with no origin condition, so these handler tests run under `service`
 * without a panel request origin. `FluxIQUserAccess` grants them from the panel (`OwnPanelAssistant`), pinned in
 * `user-access.test.ts` beside this file.
 */
function ownPanelThreads(): IamPolicy {
  const actions = ["studio:ListPanelThreads", "studio:GetPanelThread", "studio:GetPanelThreadAttachment", "studio:OpenPanelThread", "studio:RenamePanelThread", "studio:DeletePanelThread"];
  const parsed = parseIamPolicyDocument({ Version: IAM_POLICY_LANGUAGE_VERSION, Statement: [{ Sid: "OwnPanelThreads", Effect: "Allow", Action: actions, Resource: "frn:fluxiq:iam:${fluxiq:WorkspaceId}:user/${fluxiq:PrincipalId}" }] }, "identity");
  if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues));
  return { name: "OwnPanelThreads", kind: "identity", document: parsed.data };
}

/** A proposal whose one new step is "Start the post", as `getFlowBootstrapAdaptation` answers it. */
const PROPOSAL = { status: "proposed", topology: { subflows: [{ subflow: { name: "Main" }, graphFlow: { flowId: "flow.1", nodes: [{ id: "node.1", label: "Start the post", definitionId: "builtin.click", parameterValues: {} }], edges: [] } }] } } as unknown as AutomationStudioBootstrapAdaptation;

let rootDir = "";
let current: PanelAssistant<ProgramApiActor> | undefined;

type Call = (endpoint: string, caller: ProgramApiActor, payload: Record<string, unknown>) => Promise<ProgramApiResponse<any>>;

function world(options: { profile?: "service"; policies?: IamPolicy[]; model?: PanelAssistantModel } = {}) {
  const registry = new GlobalProgramApiRegistry(options.profile === "service" ? { iam: { profile: "service", source: fixedPolicySource([IAM_USER_ACCESS, ...(options.policies ?? [])]) } } : {});
  registerPrefixOwners(registry);
  const service = {
    projectPaths: { root: path.join(rootDir, "programs", "automation-studio", "projects") },
    getFlowBootstrapAdaptation: vi.fn<PanelAssistantProjectReads["getFlowBootstrapAdaptation"]>(async () => PROPOSAL),
    getFlow: vi.fn<PanelAssistantProjectReads["getFlow"]>(async () => ({ nodes: [], edges: [] })),
    assertProjectDomainAccess: vi.fn<PanelAssistantProjectReads["assertProjectDomainAccess"]>(async () => undefined)
  };
  const assistant = registerPanelAssistantEndpoints({ registry, service });
  current = assistant;
  if (options.model) panelAssistantOf(registry)!.bindModelSource(async () => ({ ok: true, model: options.model! }));
  const call: Call = (endpoint, caller, payload) => registry.call({ programId: "automation-studio", endpoint, scope: { domainId: "domain.one" }, actor: caller, payload });
  return { registry, service, assistant, call };
}

/** Where the endpoints keep the panel databases, for planting turns no endpoint writes and reading rows back. */
function panelRoot(): string {
  return path.join(rootDir, "programs", "automation-studio", "panel-assistant");
}

/** Writes alice's thread directly: a navigation turn, a proposal turn and a card with its waiting call. Closed before any endpoint opens the database. */
async function plantAlicesThread(): Promise<{ conversationId: string; navigation: string; proposal: string; plain: string; askId: string }> {
  const threads = new PanelAssistantThreads({ rootDir: panelRoot() });
  try {
    const { conversationId } = await threads.open("alice", { title: "Tidy up" });
    const plain = (await threads.append("alice", { conversationId, author: "person", text: "show me the change", actorId: "alice" })).turnId;
    const navigation = (await threads.append("alice", { conversationId, author: "automation", text: "Opened Runs.", attachment: { kind: PANEL_ASSISTANT_CLIENT_ACTION_ATTACHMENT, ref: JSON.stringify({ tool: "panel.open", input: { page: "runs" } }) } })).turnId;
    const proposal = (await threads.append("alice", { conversationId, author: "automation", text: "Here is the change.", attachment: { kind: AUTOMATION_STUDIO_FLOW_GRAPH_DIFF_ATTACHMENT, ref: "flow.1:adaptation.1" } })).turnId;
    const askId = "ask.card";
    await threads.appendCard("alice", { conversationId, text: "Delete the Flow?", ask: { askId, kind: "confirm", parks: false }, call: { toolName: "automation-studio__delete-flow", input: { projectId: ALICES_PROJECT, flowId: "flow.1" }, words: "delete my secret Flow", context: {} } });
    return { conversationId, navigation, proposal, plain, askId };
  } finally {
    await threads.close();
  }
}

/** How many rows of alice's database still name the thread, by table. */
async function rowsNaming(conversationId: string, askId: string): Promise<Record<string, number>> {
  const pool = new AutomationStudioProjectDatabasePool({ rootDir: panelRoot() });
  try {
    const lease = await pool.acquire(panelAssistantDatabaseId("alice"));
    try {
      const count = async (sql: string, params: unknown[]) => (await lease.database.get<{ count: number }>(sql, params))?.count ?? -1;
      return {
        conversations: await count("select count(*) as count from conversations where conversation_id = ?", [conversationId]),
        turns: await count("select count(*) as count from conversation_turns where conversation_id = ?", [conversationId]),
        asks: await count("select count(*) as count from conversation_asks where conversation_id = ?", [conversationId]),
        waitingCalls: await count("select count(*) as count from panel_assistant_waiting_calls where conversation_id = ?", [conversationId]),
        records: await count("select count(*) as count from mutation_records where operation_kind <> 'conversation.delete' and ((owner_kind = 'conversation' and owner_id = ?) or (owner_kind = 'conversation_ask' and owner_id = ?))", [conversationId, askId])
      };
    } finally {
      await lease.release();
    }
  } finally {
    await pool.closeAll();
  }
}

describe("panel thread attachments, renames and deletes", () => {
  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-panel-thread-changes-"));
  });

  afterEach(async () => {
    await current?.close();
    current = undefined;
    await rm(rootDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  it("reads a navigation from its own reference, and a proposal only in a named project IAM and the domain allow", async () => {
    const planted = await plantAlicesThread();
    const { call, service } = world();
    const read = (payload: Record<string, unknown>) => call(PANEL_ASSISTANT_ENDPOINTS.getThreadAttachment, alice, { conversationId: planted.conversationId, ...payload });

    expect(await read({ turnId: planted.navigation })).toEqual({ ok: true, payload: { attachment: { attachment: { kind: "panel.client-action", ref: "{\"tool\":\"panel.open\",\"input\":{\"page\":\"runs\"}}" }, payload: { tool: "panel.open", input: { page: "runs" } } } } });
    expect(await read({ turnId: planted.plain })).toEqual({ ok: true, payload: { attachment: null } });
    expect(await read({ turnId: "turn.missing" })).toEqual({ ok: true, payload: { attachment: null } });

    // A proposal is a project's record: refused without a project, or with the panel thread's own `panel`.
    for (const projectId of [undefined, "", "panel"]) {
      expect(await read({ turnId: planted.proposal, ...(projectId === undefined ? {} : { projectId }) })).toMatchObject({ ok: false, error: "A conversation attachment of kind flow-graph-diff is read in its project: name the project." });
    }
    expect(service.getFlowBootstrapAdaptation).not.toHaveBeenCalled();

    const drawn = await read({ turnId: planted.proposal, projectId: ALICES_PROJECT });
    expect(drawn).toEqual({ ok: true, payload: { attachment: { attachment: { kind: "flow-graph-diff", ref: "flow.1:adaptation.1" }, payload: { flowId: null, added: [{ id: "node.1", label: "Start the post", detail: null }], removed: [], changed: [] } } } });
    expect(service.assertProjectDomainAccess).toHaveBeenCalledWith(ALICES_PROJECT, "domain.one");
    expect(service.getFlowBootstrapAdaptation).toHaveBeenCalledWith(ALICES_PROJECT, "flow.1", "adaptation.1");

    // A project outside the request's domain is refused before anything in it is read.
    service.assertProjectDomainAccess.mockRejectedValueOnce(new Error("Project not found."));
    service.getFlowBootstrapAdaptation.mockClear();
    expect(await read({ turnId: planted.proposal, projectId: "a-project.elsewhere" })).toMatchObject({ ok: false, error: "Project not found." });
    expect(service.getFlowBootstrapAdaptation).not.toHaveBeenCalled();
  });

  it("renames with the conversations' codes, checking the name before the thread", async () => {
    const planted = await plantAlicesThread();
    const { call } = world();
    const rename = (conversationId: string, title: unknown) => call(PANEL_ASSISTANT_ENDPOINTS.renameThread, alice, { conversationId, title });

    const renamed = await rename(planted.conversationId, "  Weekly tidy  ");
    expect(renamed).toMatchObject({ ok: true, payload: { conversation: { conversationId: planted.conversationId, title: "Weekly tidy", projectId: "panel", subject: { kind: "panel", id: "panel" }, revision: 6 } } });
    expect(await rename(planted.conversationId, "   ")).toMatchObject({ ok: false, errorCode: "conversation_title_required" });
    expect(await rename(planted.conversationId, 7)).toMatchObject({ ok: false, errorCode: "conversation_title_required" });
    expect(await rename(planted.conversationId, "x".repeat(201))).toMatchObject({ ok: false, errorCode: "conversation_title_too_long" });
    expect(await rename(planted.conversationId, "x".repeat(200))).toMatchObject({ ok: true });
    expect(await rename("conversation.missing", "")).toMatchObject({ ok: false, errorCode: "conversation_title_required" });
    expect(await rename("conversation.missing", "A name")).toMatchObject({ ok: false, errorCode: "conversation_not_found", error: "I could not find that conversation." });
    const listed = await call(PANEL_ASSISTANT_ENDPOINTS.listThreads, alice, {});
    expect(listed.payload.conversations.map((thread: { title: string }) => thread.title)).toEqual(["x".repeat(200)]);
  });

  it("deletes the thread with its turns, asks, waiting calls and records, and a press on its card then finds nothing", async () => {
    const planted = await plantAlicesThread();
    expect(await rowsNaming(planted.conversationId, planted.askId)).toMatchObject({ conversations: 1, turns: 4, asks: 1, waitingCalls: 1 });
    const { call, assistant } = world();

    expect(await call(PANEL_ASSISTANT_ENDPOINTS.deleteThread, alice, { conversationId: planted.conversationId })).toEqual({ ok: true, payload: { deleted: true, conversationId: planted.conversationId } });
    expect(await call(PANEL_ASSISTANT_ENDPOINTS.getThread, alice, { conversationId: planted.conversationId })).toMatchObject({ ok: false, error: "That conversation does not exist." });
    expect((await call(PANEL_ASSISTANT_ENDPOINTS.listThreads, alice, {})).payload.conversations).toEqual([]);
    expect(await call(PANEL_ASSISTANT_ENDPOINTS.answer, alice, { askId: planted.askId, kind: "grant" })).toMatchObject({ ok: false, error: "That question does not exist." });
    expect(await call(PANEL_ASSISTANT_ENDPOINTS.deleteThread, alice, { conversationId: planted.conversationId })).toMatchObject({ ok: false, errorCode: "conversation_not_found" });

    await assistant.close();
    current = undefined;
    expect(await rowsNaming(planted.conversationId, planted.askId)).toEqual({ conversations: 0, turns: 0, asks: 0, waitingCalls: 0, records: 0 });
  });

  it("refuses a delete while a message's work still uses the thread, and allows it once the work has ended", async () => {
    let letGo: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      letGo = resolve;
    });
    let asked = 0;
    const model: PanelAssistantModel = {
      name: "scripted",
      decide: async () => {
        asked += 1;
        await held;
        return { decision: { reply: "Done." }, costUsd: 0 };
      }
    };
    const { call, assistant } = world({ model });
    const sent = await call(PANEL_ASSISTANT_ENDPOINTS.send, alice, { text: "tidy my Flows" });
    const conversationId = sent.payload.conversation.conversationId as string;
    await vi.waitFor(() => expect(asked).toBe(1));

    expect(await call(PANEL_ASSISTANT_ENDPOINTS.deleteThread, alice, { conversationId })).toMatchObject({ ok: false, errorCode: "conversation_run_active" });
    // The same id in someone else's database is not held by alice's work.
    expect(await call(PANEL_ASSISTANT_ENDPOINTS.deleteThread, bob, { conversationId })).toMatchObject({ ok: false, errorCode: "conversation_not_found" });

    letGo();
    await assistant.idle();
    expect((await call(PANEL_ASSISTANT_ENDPOINTS.getThread, alice, { conversationId })).payload.conversation.turns.map((turn: { text: string }) => turn.text)).toEqual(["tidy my Flows", "Done."]);
    expect(await call(PANEL_ASSISTANT_ENDPOINTS.deleteThread, alice, { conversationId })).toMatchObject({ ok: true, payload: { deleted: true } });
  });

  it("under the service profile, answers another person's thread exactly as a missing one, and leaves it untouched", async () => {
    const planted = await plantAlicesThread();
    const { call, service } = world({ profile: "service", policies: [ownPanelThreads()] });
    const asks: Array<[string, Record<string, unknown>]> = [
      [PANEL_ASSISTANT_ENDPOINTS.getThreadAttachment, { turnId: planted.proposal, projectId: ALICES_PROJECT }],
      [PANEL_ASSISTANT_ENDPOINTS.getThreadAttachment, { turnId: planted.navigation }],
      [PANEL_ASSISTANT_ENDPOINTS.renameThread, { title: "Mine now" }],
      [PANEL_ASSISTANT_ENDPOINTS.deleteThread, {}],
      [PANEL_ASSISTANT_ENDPOINTS.getThread, {}]
    ];
    for (const [endpoint, extra] of asks) {
      const foreign = await call(endpoint, bob, { conversationId: planted.conversationId, ...extra });
      const missing = await call(endpoint, bob, { conversationId: "conversation.missing", ...extra });
      expect(foreign).toEqual(missing);
      expect(foreign.ok === false || foreign.payload?.attachment === null).toBe(true);
    }
    expect(service.getFlowBootstrapAdaptation).not.toHaveBeenCalled();

    // Alice still has every turn of it, under its own name.
    const own = await call(PANEL_ASSISTANT_ENDPOINTS.getThread, alice, { conversationId: planted.conversationId });
    expect(own).toMatchObject({ ok: true, payload: { conversation: { conversation: { title: "Tidy up", turnCount: 4 } } } });

    // Bob's own panel thread naming alice's project: IAM refuses the project, and nothing in it is read.
    const bobs = new PanelAssistantThreads({ rootDir: panelRoot() });
    let bobsTurn = "";
    let bobsThread = "";
    try {
      bobsThread = (await bobs.open("bob", {})).conversationId;
      bobsTurn = (await bobs.append("bob", { conversationId: bobsThread, author: "automation", text: "A change.", attachment: { kind: AUTOMATION_STUDIO_FLOW_GRAPH_DIFF_ATTACHMENT, ref: "flow.1:adaptation.1" } })).turnId;
    } finally {
      await bobs.close();
    }
    expect(await call(PANEL_ASSISTANT_ENDPOINTS.getThreadAttachment, bob, { conversationId: bobsThread, turnId: bobsTurn, projectId: ALICES_PROJECT })).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(service.getFlowBootstrapAdaptation).not.toHaveBeenCalled();
    expect(service.assertProjectDomainAccess).not.toHaveBeenCalled();
    // Alice may read it in her own project.
    expect(await call(PANEL_ASSISTANT_ENDPOINTS.getThreadAttachment, alice, { conversationId: planted.conversationId, turnId: planted.proposal, projectId: ALICES_PROJECT })).toMatchObject({ ok: true, payload: { attachment: { payload: { added: [{ label: "Start the post" }] } } } });
  });
});
