// @fluxiq-test-group real-sql
// Covers handlers/conversations.ts (`../../../conversations.ts`) for `rename-conversation`,
// `delete-conversation`, a fresh `open-conversation` and the listing across
// projects, through the registry and against real project databases. The
// tenant cases run under the `service` IAM profile, where a project belongs to
// whoever owns it (`a-` projects are alice's, `b-` bob's): one tenant never
// renames, deletes or learns of another's thread, and a thread it may not see is
// answered exactly as a thread that does not exist.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalProgramApiRegistry, type ProgramApiActor, type ProgramApiResponse } from "../../../../../../_shared/api.ts";
import { actor, fixedPolicySource, registerPrefixOwners } from "../../../../../../_shared/tests/iam-registry-fixtures.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../../../../api-contracts/automation.ts";
import { AutomationStudioConversations } from "../../../../../../../framework/automation-service/index.ts";
import { AutomationStudioProjectDatabasePool } from "../../../../../../../framework/persistence/automation/index.ts";
import { IAM_POLICY_LANGUAGE_VERSION, parseIamPolicyDocument } from "@fluxiq/contracts/iam";
import type { IamPolicy } from "../../../../../../../platform/iam/index.ts";
import { IAM_USER_ACCESS, IAM_WORKSPACE_PATTERNS } from "../../../../../../../platform/iam/predefined/index.ts";
import { registerAutomationStudioConversationEndpoints } from "../../../conversations.ts";

const ALICE = "a-project.one";
const ALICE_TWO = "a-project.two";
const BOB = "b-project.one";
const alice = actor("alice", "user", ["programs.read", "programs.write"]);
const bob = actor("bob", "user", ["programs.read", "programs.write"]);

let rootDir = "";
let pool: AutomationStudioProjectDatabasePool | undefined;

type Call = (endpoint: string, caller: ProgramApiActor, payload: Record<string, unknown>) => Promise<ProgramApiResponse<any>>;

/** A grant of renaming and deleting threads on the workspace itself, so a call naming no project passes the gate under `service`. */
function workspaceThreadChanges(): IamPolicy {
  const parsed = parseIamPolicyDocument({ Version: IAM_POLICY_LANGUAGE_VERSION, Statement: [{ Sid: "WorkspaceThreadChanges", Effect: "Allow", Action: ["studio:RenameConversation", "studio:DeleteConversation"], Resource: IAM_WORKSPACE_PATTERNS.workspace }] }, "identity");
  if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues));
  return { name: "WorkspaceThreadChanges", kind: "identity", document: parsed.data };
}

function world(options: { profile?: "service"; runUsesThread?: boolean; policies?: IamPolicy[] } = {}) {
  pool = new AutomationStudioProjectDatabasePool({ rootDir });
  const conversations = new AutomationStudioConversations(pool);
  const registry = new GlobalProgramApiRegistry(options.profile === "service" ? { iam: { profile: "service", source: fixedPolicySource([IAM_USER_ACCESS, ...(options.policies ?? [])]) } } : {});
  registerPrefixOwners(registry);
  const runLinks = { usesThread: vi.fn().mockResolvedValue(options.runUsesThread === true) };
  const service = {
    assertProjectDomainAccess: vi.fn().mockResolvedValue(undefined),
    listProjects: vi.fn().mockResolvedValue({ projects: [{ id: ALICE }, { id: ALICE_TWO }, { id: BOB }] }),
    getFlowBootstrapAdaptation: vi.fn(),
    getFlow: vi.fn(),
    conversations
  };
  registerAutomationStudioConversationEndpoints({ registry, service, runLinks });
  const call: Call = (endpoint, caller, payload) => registry.call({ programId: "automation-studio", endpoint, scope: { domainId: null }, actor: caller, payload });
  const open = async (caller: ProgramApiActor, projectId: string, extra: Record<string, unknown> = {}): Promise<string> => {
    const opened = await call(AUTOMATION_STUDIO_ENDPOINTS.openConversation, caller, { projectId, ...extra });
    expect(opened.ok).toBe(true);
    return opened.payload.conversation.conversationId;
  };
  return { call, open, conversations, runLinks, service };
}

describe("renaming and deleting a conversation", () => {
  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-conversation-changes-"));
  });

  afterEach(async () => {
    if (pool) {
      await pool.closeAll();
      pool = undefined;
    }
    await rm(rootDir, { recursive: true, force: true });
  });

  it("renames a thread and answers the record get-conversation answers, with or without its project named", async () => {
    const { call, open } = world();
    const conversationId = await open(alice, ALICE_TWO);
    const renamed = await call(AUTOMATION_STUDIO_ENDPOINTS.renameConversation, alice, { projectId: ALICE_TWO, conversationId, title: "  Friday loans " });
    expect(renamed).toMatchObject({ ok: true, payload: { conversation: { conversationId, projectId: ALICE_TWO, title: "Friday loans" } } });
    const read = await call(AUTOMATION_STUDIO_ENDPOINTS.getConversation, alice, { projectId: ALICE_TWO, conversationId });
    expect(read.payload.conversation.conversation).toEqual(renamed.payload.conversation);
    // Without a project, it is found in the projects the caller may change.
    const again = await call(AUTOMATION_STUDIO_ENDPOINTS.renameConversation, alice, { conversationId, title: "Loans" });
    expect(again).toMatchObject({ ok: true, payload: { conversation: { conversationId, projectId: ALICE_TWO, title: "Loans" } } });
  });

  it("refuses a name with no words or too many, and a thread no project holds, by code", async () => {
    const { call, open } = world();
    const conversationId = await open(alice, ALICE);
    const rename = (payload: Record<string, unknown>) => call(AUTOMATION_STUDIO_ENDPOINTS.renameConversation, alice, payload);
    expect(await rename({ projectId: ALICE, conversationId, title: "  " })).toMatchObject({ ok: false, errorCode: "conversation_title_required" });
    expect(await rename({ projectId: ALICE, conversationId })).toMatchObject({ ok: false, errorCode: "conversation_title_required" });
    expect(await rename({ projectId: ALICE, conversationId, title: "x".repeat(201) })).toMatchObject({ ok: false, errorCode: "conversation_title_too_long" });
    expect(await rename({ projectId: ALICE, conversationId: "conversation.none", title: "Loans" })).toMatchObject({ ok: false, errorCode: "conversation_not_found" });
    expect(await rename({ conversationId: "conversation.none", title: "Loans" })).toMatchObject({ ok: false, errorCode: "conversation_not_found" });
  });

  it("deletes a thread with its turns and asks", async () => {
    const { call, open, conversations } = world();
    const conversationId = await open(alice, ALICE);
    await call(AUTOMATION_STUDIO_ENDPOINTS.appendConversationTurn, alice, { projectId: ALICE, conversationId, text: "Renew my loans." });
    await conversations.appendAutomationTurn({ projectId: ALICE, conversationId, text: "Which branch?", ask: { askId: "ask.branch", kind: "choice", parks: false, options: [{ id: "north", label: "North", route: null }, { id: "south", label: "South", route: null }] }, attachment: null });
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.deleteConversation, alice, { projectId: ALICE, conversationId })).toEqual({ ok: true, payload: { deleted: true, conversationId } });
    expect((await call(AUTOMATION_STUDIO_ENDPOINTS.getConversation, alice, { projectId: ALICE, conversationId })).payload).toEqual({ conversation: null });
    expect(await conversations.getAsk({ projectId: ALICE, askId: "ask.branch" })).toBeNull();
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.deleteConversation, alice, { projectId: ALICE, conversationId })).toMatchObject({ ok: false, errorCode: "conversation_not_found" });
  });

  it("refuses to delete a thread while a run still uses it, and keeps everything in it", async () => {
    const linked = world({ runUsesThread: true });
    const conversationId = await linked.open(alice, ALICE);
    await linked.call(AUTOMATION_STUDIO_ENDPOINTS.appendConversationTurn, alice, { projectId: ALICE, conversationId, text: "Run it." });
    expect(await linked.call(AUTOMATION_STUDIO_ENDPOINTS.deleteConversation, alice, { projectId: ALICE, conversationId })).toMatchObject({ ok: false, errorCode: "conversation_run_active" });
    expect(linked.runLinks.usesThread).toHaveBeenCalledWith(ALICE, expect.objectContaining({ conversationId }));
    expect((await linked.conversations.getConversation({ projectId: ALICE, conversationId }))?.turns).toHaveLength(1);
    await pool!.closeAll();

    // A run parked on one of its asks refuses it too, whatever the run links say.
    const parked = world();
    const thread = await parked.open(alice, ALICE, { subjectKind: "run", subjectId: "run.parked" });
    await parked.conversations.appendAutomationTurn({ projectId: ALICE, conversationId: thread, text: "May I press Renew?", ask: { askId: "ask.parked", kind: "confirm", parks: true }, attachment: null });
    expect(await parked.call(AUTOMATION_STUDIO_ENDPOINTS.deleteConversation, alice, { projectId: ALICE, conversationId: thread })).toMatchObject({ ok: false, errorCode: "conversation_run_active" });
  });

  it("refuses every delete when nothing can rule out a run that uses the thread", async () => {
    pool = new AutomationStudioProjectDatabasePool({ rootDir });
    const conversations = new AutomationStudioConversations(pool);
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioConversationEndpoints({ registry, service: { assertProjectDomainAccess: vi.fn(), listProjects: vi.fn(), getFlowBootstrapAdaptation: vi.fn(), getFlow: vi.fn(), conversations } });
    const thread = await conversations.openConversation({ projectId: ALICE, subject: { kind: "project", id: ALICE }, title: null });
    const response = await registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.deleteConversation, scope: { domainId: null }, actor: alice, payload: { projectId: ALICE, conversationId: thread.conversationId } });
    expect(response.ok).toBe(false);
    expect(await conversations.getConversation({ projectId: ALICE, conversationId: thread.conversationId })).not.toBeNull();
  });

  it("lets no other tenant rename, delete or learn of a thread: a foreign thread answers as a missing one", async () => {
    const { call, open, conversations } = world({ profile: "service" });
    const conversationId = await open(alice, ALICE);
    for (const endpoint of [AUTOMATION_STUDIO_ENDPOINTS.renameConversation, AUTOMATION_STUDIO_ENDPOINTS.deleteConversation]) {
      const ask = (caller: ProgramApiActor, payload: Record<string, unknown>) => call(endpoint, caller, { title: "Mine now", ...payload });
      // Bob names his own project: alice's thread is not there, exactly as a missing one is not.
      const foreignInOwn = await ask(bob, { projectId: BOB, conversationId });
      expect(foreignInOwn).toMatchObject({ ok: false, errorCode: "conversation_not_found" });
      expect(foreignInOwn).toEqual(await ask(bob, { projectId: BOB, conversationId: "conversation.none" }));
      // Bob names alice's project: IAM refuses it, whether or not the thread is there.
      const foreignInTheirs = await ask(bob, { projectId: ALICE, conversationId });
      expect(foreignInTheirs).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
      expect(foreignInTheirs).toEqual(await ask(bob, { projectId: ALICE, conversationId: "conversation.none" }));
      // Bob names no project: refused alike, and the thread is never looked for.
      expect(await ask(bob, { conversationId })).toEqual(await ask(bob, { conversationId: "conversation.none" }));
    }
    const thread = (await conversations.getConversation({ projectId: ALICE, conversationId }))?.conversation;
    expect(thread).toMatchObject({ title: null, turnCount: 0 });
    // Alice, who owns it, may rename and delete it.
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.renameConversation, alice, { projectId: ALICE, conversationId, title: "Mine" })).toMatchObject({ ok: true, payload: { conversation: { title: "Mine" } } });
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.deleteConversation, alice, { projectId: ALICE, conversationId })).toMatchObject({ ok: true, payload: { deleted: true } });
  });

  it("finds a thread without its project only in the projects the caller may change, each decided by IAM", async () => {
    const { call, open } = world({ profile: "service", policies: [workspaceThreadChanges()] });
    const conversationId = await open(alice, ALICE);
    for (const endpoint of [AUTOMATION_STUDIO_ENDPOINTS.renameConversation, AUTOMATION_STUDIO_ENDPOINTS.deleteConversation]) {
      const foreign = await call(endpoint, bob, { conversationId, title: "Mine now" });
      expect(foreign).toMatchObject({ ok: false, errorCode: "conversation_not_found" });
      expect(foreign).toEqual(await call(endpoint, bob, { conversationId: "conversation.none", title: "Mine now" }));
    }
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.renameConversation, alice, { conversationId, title: "Found" })).toMatchObject({ ok: true, payload: { conversation: { projectId: ALICE, title: "Found" } } });
    expect(await call(AUTOMATION_STUDIO_ENDPOINTS.deleteConversation, alice, { conversationId })).toMatchObject({ ok: true, payload: { deleted: true, conversationId } });
  });

  it("opens a fresh thread when asked, and continues the open one otherwise", async () => {
    const { open } = world();
    const first = await open(alice, ALICE);
    expect(await open(alice, ALICE)).toBe(first);
    const fresh = await open(alice, ALICE, { fresh: true });
    expect(fresh).not.toBe(first);
  });

  it("lists every thread the caller may see across the workspace's projects when no project is named", async () => {
    const local = world();
    const threads = [await local.open(alice, ALICE), await local.open(alice, ALICE_TWO), await local.open(bob, BOB)];
    const listed = await local.call(AUTOMATION_STUDIO_ENDPOINTS.listConversations, alice, { projectId: null });
    expect(listed.payload.conversations.map((thread: { conversationId: string }) => thread.conversationId).sort()).toEqual([...threads].sort());
    await pool!.closeAll();

    // Under the service profile each tenant's listing holds only its own projects' threads.
    const service = world({ profile: "service" });
    const alices = await service.call(AUTOMATION_STUDIO_ENDPOINTS.listConversations, alice, { projectId: null });
    const bobs = await service.call(AUTOMATION_STUDIO_ENDPOINTS.listConversations, bob, {});
    expect(alices.payload.conversations.map((thread: { projectId: string }) => thread.projectId).sort()).toEqual([ALICE, ALICE_TWO]);
    expect(bobs.payload.conversations.map((thread: { projectId: string }) => thread.projectId)).toEqual([BOB]);
  });
});
