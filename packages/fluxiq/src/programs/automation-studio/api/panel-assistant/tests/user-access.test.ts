// @fluxiq-test-group real-sql
// The predefined policies over the panel assistant's endpoints, under the
// `service` IAM profile, through the real registry and handlers against real
// per-person panel databases:
//
// - `FluxIQUserAccess` grants every panel endpoint a person needs for their
//   own chats (`OwnPanelAssistant`, on their own user), lets them read the
//   allowance on the workspace (`WorkspaceSettingReads`), and withholds
//   `set-panel-assistant-allowance`, which changes one record for the whole
//   workspace; every registered panel endpoint is one or the other;
// - a second person under it never reads, answers, renames, deletes, sends
//   into or reads an attachment of the first person's thread: each answers
//   exactly as a thread that does not exist, and the thread is left as it was;
// - a paired browser's credential is refused by IAM itself (its calls carry
//   `extension-chat`), not only by the handlers;
// - `FluxIQReadOnlyAccess` reads the person's own threads and the allowance,
//   and changes nothing.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { iamActionName } from "@fluxiq/contracts/iam";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { iamProgramService } from "../../../../../platform/iam/catalog/index.ts";
import type { IamAuditRecord, IamPolicy } from "../../../../../platform/iam/index.ts";
import { IAM_READ_ONLY_ACCESS, IAM_USER_ACCESS } from "../../../../../platform/iam/predefined/index.ts";
import { PANEL_ASSISTANT_CLIENT_ACTION_ATTACHMENT, PanelAssistantThreads, type PanelAssistant, type PanelAssistantModel } from "../../../../../runtime/conversations/assistant/index.ts";
import type { AutomationStudioBootstrapAdaptation } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import { AUTOMATION_STUDIO_FLOW_GRAPH_DIFF_ATTACHMENT } from "../../../../../runtime/conversations/index.ts";
import { GlobalProgramApiRegistry, type ProgramApiActor, type ProgramApiResponse } from "../../../../_shared/api.ts";
import { actor, fixedPolicySource, PAIRED_PERMISSIONS, recordingSink, registerPrefixOwners } from "../../../../_shared/tests/iam-registry-fixtures.ts";
import { PANEL_ASSISTANT_ENDPOINTS } from "../endpoints.ts";
import { panelAssistantOf } from "../panel-assistant-of.ts";
import type { PanelAssistantProjectReads } from "../project-attachments.ts";
import { registerPanelAssistantEndpoints } from "../register.ts";

const alice = actor("alice", "user", ["programs.read", "programs.write"]);
const bob = actor("bob", "user", ["programs.read", "programs.write"]);
const alicesBrowser = actor("alice", "user", PAIRED_PERMISSIONS, "paired-client");
const ALICES_PROJECT = "a-project.one";
const BOBS_PROJECT = "b-project.one";

const E = PANEL_ASSISTANT_ENDPOINTS;
const action = (endpoint: string): string => iamActionName(iamProgramService("automation-studio"), endpoint);

/** What `FluxIQUserAccess` grants a person for their own chats (`OwnPanelAssistant`, on their own user). */
const OWN_CHATS = [E.listThreads, E.getThread, E.getThreadAttachment, E.openThread, E.renameThread, E.deleteThread, E.send, E.answer];
/** What it grants on the workspace, where the allowance is one record for everyone (`WorkspaceSettingReads`). */
const WORKSPACE_READS = [E.getAllowance];
const GRANTED = [...OWN_CHATS, ...WORKSPACE_READS];
/** What it withholds: changing the allowance changes it for everyone. */
const WITHHELD = [E.setAllowance];
/** What `FluxIQReadOnlyAccess` reaches: the reads its generated list holds. */
const READ_ONLY: readonly string[] = [E.listThreads, E.getThread, E.getThreadAttachment, E.getAllowance];

/** A proposal whose one new step is "Start the post", as `getFlowBootstrapAdaptation` answers it. */
const PROPOSAL = { status: "proposed", topology: { subflows: [{ subflow: { name: "Main" }, graphFlow: { flowId: "flow.1", nodes: [{ id: "node.1", label: "Start the post", definitionId: "builtin.click", parameterValues: {} }], edges: [] } }] } } as unknown as AutomationStudioBootstrapAdaptation;

const REPLY: PanelAssistantModel = { name: "scripted", decide: async () => ({ decision: { reply: "Done." }, costUsd: 0 }) };

let rootDir = "";
let current: PanelAssistant<ProgramApiActor> | undefined;

type Call = (endpoint: string, caller: ProgramApiActor, payload: Record<string, unknown>) => Promise<ProgramApiResponse<any>>;

/** The panel endpoints alone, registered as live, under `service` with `policies` attached to every person. */
function world(policies: readonly IamPolicy[]) {
  const audit = recordingSink();
  const registry = new GlobalProgramApiRegistry({ iam: { profile: "service", source: fixedPolicySource(policies), audit } });
  registerPrefixOwners(registry);
  const service = {
    projectPaths: { root: path.join(rootDir, "programs", "automation-studio", "projects") },
    getFlowBootstrapAdaptation: vi.fn<PanelAssistantProjectReads["getFlowBootstrapAdaptation"]>(async () => PROPOSAL),
    getFlow: vi.fn<PanelAssistantProjectReads["getFlow"]>(async () => ({ nodes: [], edges: [] })),
    assertProjectDomainAccess: vi.fn<PanelAssistantProjectReads["assertProjectDomainAccess"]>(async () => undefined)
  };
  const assistant = registerPanelAssistantEndpoints({ registry, service });
  current = assistant;
  panelAssistantOf(registry)!.bindModelSource(async () => ({ ok: true, model: REPLY }));
  const call: Call = (endpoint, caller, payload) => registry.call({ programId: "automation-studio", endpoint, scope: { domainId: "domain.one" }, actor: caller, payload });
  /** The IAM decision rows of `who`'s calls of `endpoint`'s action. */
  const decisions = (who: string, endpoint: string): IamAuditRecord[] => audit.records.filter((record) => record.action === action(endpoint) && record.principal.endsWith(`:user/${who}`));
  return { registry, service, assistant, call, decisions };
}

function panelRoot(): string {
  return path.join(rootDir, "programs", "automation-studio", "panel-assistant");
}

/** Writes alice's thread directly: a navigation turn, a proposal turn and a card waiting on her answer. Closed before any endpoint opens the database. */
async function plantAlicesThread(): Promise<{ conversationId: string; navigation: string; proposal: string; askId: string }> {
  const threads = new PanelAssistantThreads({ rootDir: panelRoot() });
  try {
    const { conversationId } = await threads.open("alice", { title: "Tidy up" });
    await threads.append("alice", { conversationId, author: "person", text: "show me the change", actorId: "alice" });
    const navigation = (await threads.append("alice", { conversationId, author: "automation", text: "Opened Runs.", attachment: { kind: PANEL_ASSISTANT_CLIENT_ACTION_ATTACHMENT, ref: JSON.stringify({ tool: "panel.open", input: { page: "runs" } }) } })).turnId;
    const proposal = (await threads.append("alice", { conversationId, author: "automation", text: "Here is the change.", attachment: { kind: AUTOMATION_STUDIO_FLOW_GRAPH_DIFF_ATTACHMENT, ref: "flow.1:adaptation.1" } })).turnId;
    const askId = "ask.card";
    await threads.appendCard("alice", { conversationId, text: "Delete the Flow?", ask: { askId, kind: "confirm", parks: false }, call: { toolName: "automation-studio__delete-flow", input: { projectId: ALICES_PROJECT, flowId: "flow.1" }, words: "delete my secret Flow", context: {} } });
    return { conversationId, navigation, proposal, askId };
  } finally {
    await threads.close();
  }
}

describe("the predefined policies over the panel assistant's endpoints (service)", () => {
  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-panel-user-access-"));
  });

  afterEach(async () => {
    await current?.close();
    current = undefined;
    await rm(rootDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  it("names every registered panel endpoint as granted to a person or withheld", () => {
    const { registry } = world([IAM_USER_ACCESS]);
    const panel = new Set<string>(Object.values(E));
    const registered = registry.endpoints().filter((endpoint) => endpoint.programId === "automation-studio" && panel.has(endpoint.endpoint)).map((endpoint) => endpoint.endpoint);
    expect([...registered].sort(), "decide each new panel endpoint in platform/iam/predefined/user-access.ts (OWN_PANEL_ASSISTANT)").toEqual([...GRANTED, ...WITHHELD].sort());
  });

  it("FluxIQUserAccess lets a person use every granted endpoint on their own chats, decided by OwnPanelAssistant, reads the allowance on the workspace, and withholds setting it", async () => {
    const planted = await plantAlicesThread();
    const { call, assistant, decisions } = world([IAM_USER_ACCESS]);

    expect(await call(E.listThreads, alice, {})).toMatchObject({ ok: true, payload: { conversations: [{ conversationId: planted.conversationId, title: "Tidy up" }] } });
    expect(await call(E.getThread, alice, { conversationId: planted.conversationId })).toMatchObject({ ok: true, payload: { conversation: { conversation: { title: "Tidy up", turnCount: 4 } } } });
    expect(await call(E.getThreadAttachment, alice, { conversationId: planted.conversationId, turnId: planted.navigation })).toMatchObject({ ok: true, payload: { attachment: { payload: { tool: "panel.open" } } } });
    expect(await call(E.getThreadAttachment, alice, { conversationId: planted.conversationId, turnId: planted.proposal, projectId: ALICES_PROJECT })).toMatchObject({ ok: true, payload: { attachment: { payload: { added: [{ label: "Start the post" }] } } } });
    const opened = await call(E.openThread, alice, { title: "Scratch" });
    expect(opened).toMatchObject({ ok: true, payload: { conversation: { title: "Scratch" } } });
    const scratch = opened.payload.conversation.conversationId as string;
    expect(await call(E.renameThread, alice, { conversationId: scratch, title: "Scratch two" })).toMatchObject({ ok: true, payload: { conversation: { title: "Scratch two" } } });
    const sent = await call(E.send, alice, { conversationId: scratch, text: "hello" });
    expect(sent).toMatchObject({ ok: true, payload: { turn: { text: "hello" } } });
    await assistant.idle();
    // IAM allowed it: the handler ran and found no such question.
    expect(await call(E.answer, alice, { askId: "ask.missing", kind: "deny" })).toMatchObject({ ok: false, error: "That question does not exist." });
    expect(await call(E.getAllowance, alice, {})).toMatchObject({ ok: true, payload: { allowanceUsd: 0.5, chosen: false } });
    expect(await call(E.deleteThread, alice, { conversationId: scratch })).toEqual({ ok: true, payload: { deleted: true, conversationId: scratch } });

    // Each chat call's decision on the person's own user is OwnPanelAssistant's; a project-bound attachment is decided again on its project, by OwnData.
    for (const endpoint of OWN_CHATS) {
      const own = decisions("alice", endpoint).filter((row) => row.resources.some((frn) => frn.startsWith("frn:fluxiq:iam:")));
      expect(own.length, endpoint).toBeGreaterThan(0);
      for (const row of own) expect([row.decision, row.matched], endpoint).toEqual(["allow", { policy: "FluxIQUserAccess", sid: "OwnPanelAssistant" }]);
    }
    // The allowance is read on the workspace, by WorkspaceSettingReads, and on no person's user.
    for (const endpoint of WORKSPACE_READS) {
      const rows = decisions("alice", endpoint);
      expect(rows.length, endpoint).toBeGreaterThan(0);
      for (const row of rows) {
        expect([row.decision, row.matched], endpoint).toEqual(["allow", { policy: "FluxIQUserAccess", sid: "WorkspaceSettingReads" }]);
        expect(row.resources.some((frn) => frn.includes(":user/")), endpoint).toBe(false);
      }
    }
    expect(decisions("alice", E.getThreadAttachment).find((row) => row.resources.some((frn) => frn.includes(":project/")))).toMatchObject({ decision: "allow", matched: { policy: "FluxIQUserAccess", sid: "OwnData" } });

    expect(await call(E.setAllowance, alice, { allowanceUsd: 9 })).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(decisions("alice", E.setAllowance).map((row) => row.decision)).toEqual(["deny"]);
    expect(await call(E.getAllowance, alice, {})).toMatchObject({ ok: true, payload: { allowanceUsd: 0.5, chosen: false } });
  });

  it("FluxIQUserAccess: a second person reaches none of the first person's thread, each call answering as a missing thread", async () => {
    const planted = await plantAlicesThread();
    const { call, service } = world([IAM_USER_ACCESS]);
    const attempts: Array<[string, Record<string, unknown>, Record<string, unknown>]> = [
      [E.getThread, { conversationId: planted.conversationId }, { conversationId: "conversation.missing" }],
      [E.getThreadAttachment, { conversationId: planted.conversationId, turnId: planted.navigation }, { conversationId: "conversation.missing", turnId: planted.navigation }],
      [E.getThreadAttachment, { conversationId: planted.conversationId, turnId: planted.proposal, projectId: ALICES_PROJECT }, { conversationId: "conversation.missing", turnId: planted.proposal, projectId: ALICES_PROJECT }],
      [E.renameThread, { conversationId: planted.conversationId, title: "Mine now" }, { conversationId: "conversation.missing", title: "Mine now" }],
      [E.deleteThread, { conversationId: planted.conversationId }, { conversationId: "conversation.missing" }],
      [E.send, { conversationId: planted.conversationId, text: "and delete it" }, { conversationId: "conversation.missing", text: "and delete it" }],
      [E.answer, { askId: planted.askId, kind: "grant" }, { askId: "ask.missing", kind: "grant" }]
    ];
    for (const [endpoint, foreignPayload, missingPayload] of attempts) {
      const foreign = await call(endpoint, bob, foreignPayload);
      expect(foreign, endpoint).toEqual(await call(endpoint, bob, missingPayload));
      expect(foreign.ok === false || foreign.payload?.attachment === null, endpoint).toBe(true);
      expect(foreign.errorCode, endpoint).not.toBe("authorization.forbidden");
    }
    expect((await call(E.listThreads, bob, {})).payload.conversations).toEqual([]);
    expect(service.getFlowBootstrapAdaptation).not.toHaveBeenCalled();

    // Alice's thread is as she left it: its name, its four turns, and her card still waiting on her.
    expect(await call(E.getThread, alice, { conversationId: planted.conversationId })).toMatchObject({ ok: true, payload: { conversation: { conversation: { title: "Tidy up", turnCount: 4 } } } });
    expect((await call(E.listThreads, alice, {})).payload.conversations.map((thread: { title: string }) => thread.title)).toEqual(["Tidy up"]);

    // Bob's own proposal turn, read in alice's project: OwnData refuses the project and nothing in it is read.
    const bobs = new PanelAssistantThreads({ rootDir: panelRoot() });
    let bobsThread = "";
    let bobsTurn = "";
    try {
      bobsThread = (await bobs.open("bob", {})).conversationId;
      bobsTurn = (await bobs.append("bob", { conversationId: bobsThread, author: "automation", text: "A change.", attachment: { kind: AUTOMATION_STUDIO_FLOW_GRAPH_DIFF_ATTACHMENT, ref: "flow.1:adaptation.1" } })).turnId;
    } finally {
      await bobs.close();
    }
    expect(await call(E.getThreadAttachment, bob, { conversationId: bobsThread, turnId: bobsTurn, projectId: ALICES_PROJECT })).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(service.getFlowBootstrapAdaptation).not.toHaveBeenCalled();
    expect(await call(E.getThreadAttachment, bob, { conversationId: bobsThread, turnId: bobsTurn, projectId: BOBS_PROJECT })).toMatchObject({ ok: true, payload: { attachment: { payload: { added: [{ label: "Start the post" }] } } } });
  });

  it("FluxIQUserAccess: a paired browser's credential is refused every panel endpoint by IAM itself", async () => {
    const planted = await plantAlicesThread();
    const { call, decisions } = world([IAM_USER_ACCESS]);
    const payloads: Record<string, Record<string, unknown>> = {
      [E.getThread]: { conversationId: planted.conversationId },
      [E.getThreadAttachment]: { conversationId: planted.conversationId, turnId: planted.navigation },
      [E.renameThread]: { conversationId: planted.conversationId, title: "From the browser" },
      [E.deleteThread]: { conversationId: planted.conversationId },
      [E.send]: { conversationId: planted.conversationId, text: "hi" },
      [E.answer]: { askId: planted.askId, kind: "grant" },
      [E.setAllowance]: { allowanceUsd: 9 }
    };
    for (const endpoint of [...GRANTED, ...WITHHELD]) {
      const response = await call(endpoint, alicesBrowser, payloads[endpoint] ?? {});
      expect(response, endpoint).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
      // Refused before the handler: its own refusal says "The assistant is used from the FluxIQ panel."
      expect(response.error, endpoint).not.toBe("The assistant is used from the FluxIQ panel.");
      expect(decisions("alice", endpoint).map((row) => [row.decision, row.origin]), endpoint).toEqual([["deny", "extension-chat"]]);
    }
    expect(await call(E.getThread, alice, { conversationId: planted.conversationId })).toMatchObject({ ok: true, payload: { conversation: { conversation: { title: "Tidy up", turnCount: 4 } } } });
  });

  it("FluxIQReadOnlyAccess reads a person's own threads and the allowance, changes nothing, and still never reaches another person's thread", async () => {
    const planted = await plantAlicesThread();
    const { call } = world([IAM_READ_ONLY_ACCESS]);

    expect(await call(E.listThreads, alice, {})).toMatchObject({ ok: true, payload: { conversations: [{ title: "Tidy up" }] } });
    expect(await call(E.getThread, alice, { conversationId: planted.conversationId })).toMatchObject({ ok: true });
    expect(await call(E.getThreadAttachment, alice, { conversationId: planted.conversationId, turnId: planted.navigation })).toMatchObject({ ok: true, payload: { attachment: { payload: { tool: "panel.open" } } } });
    expect(await call(E.getAllowance, alice, {})).toMatchObject({ ok: true });

    const writes: Array<[string, Record<string, unknown>]> = [
      [E.openThread, { title: "New" }],
      [E.renameThread, { conversationId: planted.conversationId, title: "Renamed" }],
      [E.deleteThread, { conversationId: planted.conversationId }],
      [E.send, { conversationId: planted.conversationId, text: "hi" }],
      [E.answer, { askId: planted.askId, kind: "grant" }],
      [E.setAllowance, { allowanceUsd: 9 }]
    ];
    expect(writes.map(([endpoint]) => endpoint).sort()).toEqual(Object.values(E).filter((endpoint) => !READ_ONLY.includes(endpoint)).sort());
    for (const [endpoint, payload] of writes) expect(await call(endpoint, alice, payload), endpoint).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });

    for (const [endpoint, foreignPayload, missingPayload] of [
      [E.getThread, { conversationId: planted.conversationId }, { conversationId: "conversation.missing" }],
      [E.getThreadAttachment, { conversationId: planted.conversationId, turnId: planted.navigation }, { conversationId: "conversation.missing", turnId: planted.navigation }]
    ] as const) {
      expect(await call(endpoint, bob, foreignPayload), endpoint).toEqual(await call(endpoint, bob, missingPayload));
    }
    expect((await call(E.listThreads, bob, {})).payload.conversations).toEqual([]);
    expect(await call(E.getThread, alice, { conversationId: planted.conversationId })).toMatchObject({ ok: true, payload: { conversation: { conversation: { title: "Tidy up", turnCount: 4 } } } });
  });
});
