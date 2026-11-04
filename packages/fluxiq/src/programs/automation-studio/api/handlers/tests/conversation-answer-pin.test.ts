// @fluxiq-test-group real-sql
// The PIN on an answer, through the registered `answer-ask` endpoint, against
// the real Identity Access service and a real thread store: the wrong PIN is
// typed, not stood in for. Nothing here is stubbed but the project's domain.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../../_shared/api.ts";
import { IdentityAccessService } from "../../../../identity-access/index.ts";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../../api-contracts/automation.ts";
import { AutomationStudioConversations, type AutomationStudioConversationAskInput } from "../../../../../framework/automation-service/index.ts";
import { AutomationStudioProjectDatabasePool } from "../../../../../framework/persistence/automation/index.ts";
import { registerAutomationStudioConversationEndpoints } from "../conversations.ts";

const PROJECT = "project.one";
const PIN = "246810";
const lowCost = { passwordKdf: { testOnlyWeakParameters: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } } } as const;

const ask = (askId: string, fields: Partial<AutomationStudioConversationAskInput>): AutomationStudioConversationAskInput => ({
  askId,
  kind: "confirm",
  parks: true,
  timeoutMs: null,
  onTimeout: null,
  options: null,
  routes: null,
  consequences: null,
  missing: null,
  control: null,
  permissionRequest: null,
  ...fields
});

describe("the PIN on an answer", () => {
  let rootDir: string;
  let conversations: AutomationStudioConversations;
  let registry: GlobalProgramApiRegistry;
  let conversationId: string;
  let sessionId: string;
  let panel: ProgramApiActor;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "conversation-answer-pin-test-"));
    conversations = new AutomationStudioConversations(new AutomationStudioProjectDatabasePool({ rootDir }));
    conversationId = (await conversations.openConversation({ projectId: PROJECT, subject: { kind: "project", id: PROJECT }, title: null })).conversationId;
    const identityAccess = new IdentityAccessService(lowCost);
    await identityAccess.setPassword("admin", "a-long-test-password");
    await identityAccess.setPin("admin", PIN);
    const login = await identityAccess.authenticate({ username: "admin", password: "a-long-test-password" });
    if (!("session" in login)) throw new Error("The test user did not sign in.");
    sessionId = login.session.id;
    panel = { sessionId, userId: "admin", roleId: "admin", permissions: ["programs.write"], channel: "panel" };
    registry = new GlobalProgramApiRegistry({ identityAccess });
    registerAutomationStudioConversationEndpoints({
      registry,
      identityAccess,
      service: {
        assertProjectDomainAccess: vi.fn().mockResolvedValue(undefined),
        listProjects: vi.fn().mockResolvedValue({ projects: [] }),
        conversations,
        getFlowBootstrapAdaptation: vi.fn().mockResolvedValue(null),
        getFlow: vi.fn()
      }
    });
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true, maxRetries: 3 });
  });

  async function raise(input: AutomationStudioConversationAskInput): Promise<void> {
    await conversations.appendAutomationTurn({ projectId: PROJECT, conversationId, text: "May I?", ask: input, attachment: null });
  }

  const answer = (askId: string, kind: string, extra: Record<string, unknown> = {}, actor: ProgramApiActor = panel) => registry.call({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.answerConversationAsk,
    scope: { domainId: null },
    actor,
    payload: { projectId: PROJECT, askId, kind, authSessionId: sessionId, ...extra }
  });

  const statusOf = async (askId: string) => (await conversations.getAsk({ projectId: PROJECT, askId }))?.status;

  it("refuses a wrong PIN on a permission grant with the reason, and leaves the question waiting", async () => {
    await raise(ask("request.post", { kind: "permission", missing: ["send_or_publish"], consequences: ["send_or_publish"] }));
    const wrong = await answer("request.post", "grant", { authorizationPin: "000000" });
    expect(wrong).toMatchObject({ ok: false, error: "Invalid PIN" });
    expect(JSON.stringify(wrong)).not.toContain("000000");
    expect(await statusOf("request.post")).toBe("pending");

    const right = await answer("request.post", "grant", { authorizationPin: PIN });
    expect(right.ok, right.error).toBe(true);
    expect(await statusOf("request.post")).toBe("answered");
  });

  it("refuses a grant that carries no PIN at all", async () => {
    await raise(ask("request.pay", { kind: "permission", missing: ["move_money"], consequences: ["move_money"] }));
    expect(await answer("request.pay", "grant")).toMatchObject({ ok: false, error: "PIN is required for this action" });
    expect(await statusOf("request.pay")).toBe("pending");
  });

  it("refuses a wrong PIN on a choice a run waits on when the ask names a gated class", async () => {
    const options = [{ id: "oldest", label: "Clear the oldest", route: null }, { id: "all", label: "Clear both", route: null }];
    await raise(ask("ask.which", { kind: "choice", options, consequences: ["delete"] }));
    expect(await answer("ask.which", "choice", { value: "all", authorizationPin: "000000" })).toMatchObject({ ok: false, error: "Invalid PIN" });
    expect(await statusOf("ask.which")).toBe("pending");
    expect((await answer("ask.which", "choice", { value: "all", authorizationPin: PIN })).ok).toBe(true);
  });

  it("refuses a wrong PIN on a panel confirmation before it settles, so it can be answered again", async () => {
    await raise(ask("panel-command.1", { parks: false, consequences: ["delete"] }));
    expect(await answer("panel-command.1", "grant", { authorizationPin: "000000" })).toMatchObject({ ok: false, error: "Invalid PIN" });
    expect(await statusOf("panel-command.1")).toBe("pending");
  });

  it("takes a refusal without a PIN, whatever the ask would have committed", async () => {
    await raise(ask("request.no", { kind: "permission", missing: ["delete"], consequences: ["delete"] }));
    expect((await answer("request.no", "deny")).ok).toBe(true);
    expect(await statusOf("request.no")).toBe("answered");
  });

  it("asks nothing where no act depends on the PIN", async () => {
    await raise(ask("ask.approve", { consequences: [] }));
    await raise(ask("ask.edit", { consequences: ["modify_existing"] }));
    await raise(ask("declaration-cross-check:send_or_publish:1", { parks: false, consequences: ["send_or_publish"] }));
    for (const askId of ["ask.approve", "ask.edit", "declaration-cross-check:send_or_publish:1"]) {
      const answered = await answer(askId, "grant");
      expect(answered.ok, `${askId}: ${answered.error}`).toBe(true);
    }
  });

  it("a paired client answers with its press: it has no PIN to give and no dialog to ask for one", async () => {
    await raise(ask("request.paired", { kind: "permission", missing: ["send_or_publish"], consequences: ["send_or_publish"] }));
    const paired: ProgramApiActor = { ...panel, sessionId: "client-gateway:gateway.one", channel: "paired-client" };
    const answered = await answer("request.paired", "grant", { authSessionId: undefined }, paired);
    expect(answered.ok, answered.error).toBe(true);
  });

  it("an answer already settled replays without asking again", async () => {
    await raise(ask("request.twice", { kind: "permission", missing: ["delete"], consequences: ["delete"] }));
    expect((await answer("request.twice", "grant", { authorizationPin: PIN })).ok).toBe(true);
    expect((await answer("request.twice", "grant")).ok).toBe(true);
  });
});
