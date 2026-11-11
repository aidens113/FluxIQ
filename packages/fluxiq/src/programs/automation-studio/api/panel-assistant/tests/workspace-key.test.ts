// @fluxiq-test-group real-sql
// The dock on the workspace's assistant key, under the `service` IAM profile,
// through the real registry, Secret Keys' and the panel's real handlers, real
// per-person panel databases and the real key release, with a fake provider in
// place of the network (no model is called):
//
// - the owner reads the model and sends on their key, released to their unlock;
// - a member (`FluxIQUserAccess`) reads the same model and sends on the same
//   key, released server-side to the owner's live unlock for that call only:
//   nothing the member receives or reads back carries the value;
// - with the owner's key locked, the member's message ends with the typed
//   `secrets.locked` error, and no call reaches the provider;
// - a key its owner did not choose for the workspace never pays for someone
//   else, even when an owner made it the default;
// - a read-only person and a person outside the workspace send nothing.
//
// Dummy passwords and values only.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isSecretsLockedError, secretsLockedMessage } from "@fluxiq/contracts/platform";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IamPolicy, IamPolicySource } from "../../../../../platform/iam/index.ts";
import { IAM_OWNER_FULL_ACCESS, IAM_READ_ONLY_ACCESS, IAM_USER_ACCESS } from "../../../../../platform/iam/predefined/index.ts";
import { panelAssistantKeyModelSource, type PanelAssistant } from "../../../../../runtime/conversations/assistant/index.ts";
import type { AutomationStudioSessionKeyPorts } from "../../../../../runtime/llm/index.ts";
import { GlobalProgramApiRegistry, type ProgramApiActor, type ProgramApiResponse } from "../../../../_shared/api.ts";
import { actor } from "../../../../_shared/tests/iam-registry-fixtures.ts";
import { registerSecretKeysApi, SecretKeysService } from "../../../../secret-keys/index.ts";
import { WEAK_SCRYPT_PARAMETERS, createMemoryRepository } from "../../../../secret-keys/runtime/tests/secret-key-fixtures.ts";
import { PANEL_ASSISTANT_ENDPOINTS } from "../endpoints.ts";
import { panelAssistantOf } from "../panel-assistant-of.ts";
import type { PanelAssistantProjectReads } from "../project-attachments.ts";
import { registerPanelAssistantEndpoints } from "../register.ts";

const E = PANEL_ASSISTANT_ENDPOINTS;
const HOST = "app.example.test";
const OWNER_PASSWORD = "dummy-owner-password";
const MEMBER_PASSWORD = "dummy-member-password";
const TEAM_VALUE = "dummy-team-key-value";
const MEMBER_VALUE = "dummy-member-key-value";
const PEOPLE = ["programs.read", "programs.write", "secrets.manage"] as const;

const owner = actor("owner", "admin", [...PEOPLE]);
const member = actor("member", "user", [...PEOPLE]);
const reader = actor("reader", "viewer", ["programs.read"]);
const outsider = actor("outsider", "user", [...PEOPLE]);

/** Each person's policies in this workspace; the outsider has no membership, so none. */
const POLICIES: Readonly<Record<string, readonly IamPolicy[]>> = { owner: [IAM_OWNER_FULL_ACCESS], member: [IAM_USER_ACCESS], reader: [IAM_READ_ONLY_ACCESS] };
const membership: IamPolicySource = {
  resolvePolicySet: async (principal) => ({ identity: POLICIES[principal.id] ?? [], guardrails: [], sessions: [], boundary: null }),
  getRole: async () => null
};

/** A fake Anthropic: records which credential each call carried, and answers one reply. */
function fakeProvider() {
  const credentials: string[] = [];
  const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
    credentials.push(new Headers(init?.headers).get("authorization") ?? "");
    const model = (JSON.parse(String(init?.body)) as { model: string }).model;
    const text = JSON.stringify({ result_json: JSON.stringify({ reply: "Done." }) });
    const envelope = { id: "msg_1", type: "message", role: "assistant", model, content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } };
    return new Response(JSON.stringify(envelope), { status: 200, headers: { "content-type": "application/json" } });
  });
  return { fetchImpl, credentials };
}

let rootDir = "";
let current: PanelAssistant<ProgramApiActor> | undefined;
let keys: SecretKeysService | undefined;

async function workspace() {
  const secretKeys = new SecretKeysService({ repository: createMemoryRepository().repository, passwordKdf: { testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS } });
  keys = secretKeys;
  const registry = new GlobalProgramApiRegistry({ iam: { profile: "service", source: membership } });
  registerSecretKeysApi(registry, secretKeys);
  const service = {
    projectPaths: { root: path.join(rootDir, "programs", "automation-studio", "projects") },
    getFlowBootstrapAdaptation: vi.fn<PanelAssistantProjectReads["getFlowBootstrapAdaptation"]>(),
    getFlow: vi.fn<PanelAssistantProjectReads["getFlow"]>(),
    assertProjectDomainAccess: vi.fn<PanelAssistantProjectReads["assertProjectDomainAccess"]>(async () => undefined)
  };
  current = registerPanelAssistantEndpoints({ registry, service });
  // The ports as the host binds them for a panel caller (`programs/_shared/runtime.ts`, `sessionKeyPorts` and `callerUnlock`).
  const keyPorts: AutomationStudioSessionKeyPorts = {
    snapshot: () => secretKeys.snapshot(),
    createSessionRevealAuthorization: (input) => secretKeys.createSessionRevealAuthorization(input),
    revealKeyWithAuthorization: (input) => secretKeys.revealKeyWithAuthorization(input),
    revokeRevealAuthorization: (authorizationId) => secretKeys.revokeRevealAuthorization(authorizationId),
    fallbackUnlockFor: (userId, sessionId) => (secretKeys.credentialUnlocks.mayFallBack(userId, sessionId ?? undefined) ? secretKeys.unlockedSessionFor(userId) : null)
  };
  const provider = fakeProvider();
  const source = panelAssistantKeyModelSource({ resolveAssistant: () => secretKeys.modelKeys.resolveAssistant(), keyPorts, instanceHost: HOST, fetchImpl: provider.fetchImpl });
  panelAssistantOf(registry)!.bindModelSource(source);
  const call = (programId: string, endpoint: string, caller: ProgramApiActor, payload: Record<string, unknown> = {}) =>
    registry.call({ programId, endpoint, scope: { domainId: "domain.one" }, actor: caller, payload }) as Promise<ProgramApiResponse<any>>;
  /** Sends `text` as `caller`, waits for the work, and answers the reply and the thread's texts as the caller reads them back. */
  const send = async (caller: ProgramApiActor, text: string) => {
    const sent = await call("automation-studio", E.send, caller, { text });
    await current!.idle();
    if (!sent.ok) return { sent, texts: [] as string[] };
    const read = await call("automation-studio", E.getThread, caller, { conversationId: sent.payload.conversation.conversationId });
    const turns = (read.payload?.conversation?.turns ?? []) as Array<{ text: string }>;
    return { sent, read, texts: turns.map((turn) => turn.text) };
  };
  const unlock = (who: ProgramApiActor, password: string) => secretKeys.unlockSession({ sessionId: who.sessionId, userId: who.userId, authorizationPassword: password, expiresAtMs: Date.now() + 3_600_000 });
  const teamKey = await secretKeys.createKey({ name: "Team key", value: TEAM_VALUE, authorizationPassword: OWNER_PASSWORD, provider: "Anthropic", createdBy: owner.userId });
  return { secretKeys, call, send, unlock, provider, source, teamKey };
}

describe("the dock on the workspace's assistant key (service)", () => {
  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-panel-workspace-key-"));
  });

  afterEach(async () => {
    await current?.close();
    current = undefined;
    keys?.close();
    keys = undefined;
    await rm(rootDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  });

  it("the owner reads the model and sends on their key; a member reads the same model and sends on it, never holding its value", async () => {
    const { call, send, unlock, provider, teamKey } = await workspace();
    expect(await call("secret-keys", "set-assistant-model", owner, { keyId: teamKey.id, model: "claude-haiku-5-5" })).toMatchObject({ ok: true });
    await unlock(owner, OWNER_PASSWORD);

    for (const caller of [owner, member]) {
      expect(await call("secret-keys", "get-assistant-model", caller), caller.userId).toMatchObject({ ok: true, payload: { assistantKeyId: teamKey.id, assistantModel: "claude-haiku-5-5", assistantProvider: "Anthropic" } });
    }

    const byOwner = await send(owner, "hello");
    expect(byOwner.sent).toMatchObject({ ok: true });
    expect(byOwner.texts).toEqual(["hello", "Done."]);

    const byMember = await send(member, "hello from a member");
    expect(byMember.sent).toMatchObject({ ok: true });
    expect(byMember.texts).toEqual(["hello from a member", "Done."]);
    // Each call reached the provider port with the workspace's key, released for it.
    expect(provider.credentials).toEqual([`Bearer ${TEAM_VALUE}`, `Bearer ${TEAM_VALUE}`]);
    // What the member is answered and reads back never carries it.
    expect(JSON.stringify([byMember.sent, byMember.read])).not.toContain(TEAM_VALUE);
  });

  it("with the owner's key locked, a member's message ends with the typed secrets.locked error and reaches no provider", async () => {
    const { secretKeys, send, unlock, provider, source } = await workspace();
    await unlock(owner, OWNER_PASSWORD);
    // The owner signs out: their only unlock goes.
    expect(secretKeys.revokeSessionUnlock(owner.sessionId, { userId: owner.userId, administrator: false })).toBe(true);

    const byMember = await send(member, "hello from a member");
    expect(byMember.sent).toMatchObject({ ok: true });
    expect(byMember.texts[1]).toContain(secretsLockedMessage(HOST));
    expect(provider.fetchImpl).not.toHaveBeenCalled();

    // The model the dock was given throws the contract's typed error itself, not a generic provider failure.
    const choice = await source({ userId: member.userId, sessionId: member.sessionId });
    expect(choice.ok).toBe(true);
    if (!choice.ok) return;
    const failure = await choice.model.decide({ instructions: "x", transcript: [{ author: "person", text: "hi" }] }, { signal: new AbortController().signal, caller: { userId: member.userId, sessionId: member.sessionId } }).catch((error: unknown) => error);
    expect(isSecretsLockedError(failure)).toBe(true);
    expect(provider.fetchImpl).not.toHaveBeenCalled();
  });

  it("never spends a key its owner did not choose for the workspace, even one an owner made the default", async () => {
    const { secretKeys, call, send, unlock, provider } = await workspace();
    const mine = await secretKeys.createKey({ name: "Mine", value: MEMBER_VALUE, authorizationPassword: MEMBER_PASSWORD, provider: "Anthropic", createdBy: member.userId });
    await unlock(owner, OWNER_PASSWORD);
    await unlock(member, MEMBER_PASSWORD);
    expect(await call("secret-keys", "set-default-key", owner, { id: mine.id })).toMatchObject({ ok: true });

    const byOwner = await send(owner, "hello");
    expect(byOwner.sent).toMatchObject({ ok: true });
    expect(byOwner.texts[1]).toBe("The assistant's key belongs to another person, who has not chosen it as this workspace's key. Ask them to choose it in Settings, or add a key of your own.");
    expect(provider.fetchImpl).not.toHaveBeenCalled();

    // The member's own key still answers the member, on their own unlock.
    const byMember = await send(member, "hello");
    expect(byMember.texts).toEqual(["hello", "Done."]);
    expect(provider.credentials).toEqual([`Bearer ${MEMBER_VALUE}`]);
  });

  it("refuses a read-only person's message and a person outside the workspace entirely", async () => {
    const { call, send, unlock, provider } = await workspace();
    await unlock(owner, OWNER_PASSWORD);
    expect((await send(reader, "hello")).sent).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect((await send(outsider, "hello")).sent).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(await call("secret-keys", "get-assistant-model", outsider)).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(provider.fetchImpl).not.toHaveBeenCalled();
  });
});
