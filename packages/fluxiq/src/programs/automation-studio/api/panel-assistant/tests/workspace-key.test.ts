// @fluxiq-test-group real-sql
// The dock on the workspace's assistant key, under the `service` IAM profile,
// through the real registry, Secret Keys' and the panel's real handlers, real
// per-person panel databases and the real key release, with a fake provider in
// place of the network (no model is called):
//
// - the owner reads the model and sends on their key, released to their unlock;
// - a member (`FluxIQUserAccess`) reads the same model and sends on the same
//   key, once the owner chose it and offered it, released server-side to the
//   owner's live unlock for that call only: nothing the member receives or
//   reads back carries the value;
// - with the owner's key locked, the member's message ends with the typed
//   `secrets.locked` error worded for the workspace's key, the owner's own
//   with their own words, and no call reaches the provider;
// - no key is shared automatically: another person's key pays only when it is
//   both chosen for the workspace and offered by its holder; chosen alone,
//   offered alone, or an offer withdrawn, and the sender is told in plain
//   words who can choose one, with no model call;
// - the owner's own key keeps working for the owner with neither step, and on
//   `local` too;
// - a read-only person and a person outside the workspace send nothing.
//
// Dummy passwords and values only.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isSecretsLockedError, secretsLockedMessage, workspaceKeyLockedMessage } from "@fluxiq/contracts/platform";
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

/** What the dock answers when the workspace's key is another person's and nobody chose it. */
const NOT_CHOSEN = "No model key has been chosen for this workspace's messages yet. An owner or administrator of this workspace chooses one in Settings, from a key its holder has offered to the workspace.";
/** What it answers when the chosen key is another person's who has not offered it. */
const NOT_OFFERED = "The key chosen for this workspace's messages has not been offered to the workspace by the person who added it, so it pays only for their own messages. They can offer it in Settings, or an owner or administrator of this workspace can choose another.";

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

async function workspace(profile: "service" | "local" = "service") {
  const secretKeys = new SecretKeysService({ repository: createMemoryRepository().repository, passwordKdf: { testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS } });
  keys = secretKeys;
  const registry = new GlobalProgramApiRegistry(profile === "service" ? { iam: { profile: "service", source: membership } } : {});
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
  /** The owner offers their own key to the workspace and chooses it as the assistant's: both steps a member's message needs. */
  const share = async () => {
    expect(await call("secret-keys", "offer-key", owner, { id: teamKey.id, offered: true })).toMatchObject({ ok: true });
    expect(await call("secret-keys", "set-assistant-model", owner, { keyId: teamKey.id })).toMatchObject({ ok: true });
  };
  return { secretKeys, call, send, unlock, provider, source, teamKey, share };
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
    expect(await call("secret-keys", "offer-key", owner, { id: teamKey.id, offered: true })).toMatchObject({ ok: true });
    expect(await call("secret-keys", "set-assistant-model", owner, { keyId: teamKey.id, model: "claude-haiku-5-5" })).toMatchObject({ ok: true });
    await unlock(owner, OWNER_PASSWORD);

    for (const caller of [owner, member]) {
      expect(await call("secret-keys", "get-assistant-model", caller), caller.userId).toMatchObject({ ok: true, payload: { assistantKeyId: teamKey.id, assistantModel: "claude-haiku-5-5", assistantProvider: "Anthropic", assistantKeyChosen: true, assistantKeyOffered: true } });
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

  it("with the owner's key locked, a member is told the workspace's key is locked and its owner must unlock it, the owner their own words, and no provider is reached", async () => {
    const { secretKeys, send, unlock, provider, source, share } = await workspace();
    await share();
    await unlock(owner, OWNER_PASSWORD);
    // The owner signs out: their only unlock goes.
    expect(secretKeys.revokeSessionUnlock(owner.sessionId, { userId: owner.userId, administrator: false })).toBe(true);

    const byMember = await send(member, "hello from a member");
    expect(byMember.sent).toMatchObject({ ok: true });
    expect(byMember.texts[1]).toContain(workspaceKeyLockedMessage(HOST));
    expect(byMember.texts[1]).not.toContain(secretsLockedMessage(HOST));
    // The holder still sees their own wording.
    const byOwner = await send(owner, "hello from the owner");
    expect(byOwner.texts[1]).toContain(secretsLockedMessage(HOST));
    expect(provider.fetchImpl).not.toHaveBeenCalled();

    // The model the dock was given throws the contract's typed error itself, not a generic provider failure.
    const choice = await source({ userId: member.userId, sessionId: member.sessionId });
    expect(choice.ok).toBe(true);
    if (!choice.ok) return;
    const failure = await choice.model.decide({ instructions: "x", transcript: [{ author: "person", text: "hi" }] }, { signal: new AbortController().signal, caller: { userId: member.userId, sessionId: member.sessionId } }).catch((error: unknown) => error);
    expect(isSecretsLockedError(failure)).toBe(true);
    expect((failure as Error).message).toBe(workspaceKeyLockedMessage(HOST));
    expect(provider.fetchImpl).not.toHaveBeenCalled();
  });

  it("shares no key automatically: the owner's first key answers the owner, and a member is told who can choose one", async () => {
    const { send, unlock, provider } = await workspace();
    await unlock(owner, OWNER_PASSWORD);
    const byMember = await send(member, "hello");
    expect(byMember.sent).toMatchObject({ ok: true });
    expect(byMember.texts).toEqual(["hello", NOT_CHOSEN]);
    expect(provider.fetchImpl).not.toHaveBeenCalled();
    // The owner's own key answers the owner with neither step.
    expect((await send(owner, "hello")).texts).toEqual(["hello", "Done."]);
    expect(provider.credentials).toEqual([`Bearer ${TEAM_VALUE}`]);
  });

  it("releases another person's key only when it is both chosen and offered, and stops when the offer is withdrawn", async () => {
    const { call, send, unlock, provider, teamKey } = await workspace();
    await unlock(owner, OWNER_PASSWORD);

    // Offered, not chosen.
    expect(await call("secret-keys", "offer-key", owner, { id: teamKey.id, offered: true })).toMatchObject({ ok: true });
    expect((await send(member, "offered only")).texts).toEqual(["offered only", NOT_CHOSEN]);
    // Chosen, not offered.
    expect(await call("secret-keys", "offer-key", owner, { id: teamKey.id, offered: false })).toMatchObject({ ok: true });
    expect(await call("secret-keys", "set-default-key", owner, { id: teamKey.id })).toMatchObject({ ok: true });
    expect((await send(member, "chosen only")).texts).toEqual(["chosen only", NOT_OFFERED]);
    expect(provider.fetchImpl).not.toHaveBeenCalled();
    // Both: released to the owner's unlock for the member's call.
    expect(await call("secret-keys", "offer-key", owner, { id: teamKey.id, offered: true })).toMatchObject({ ok: true });
    expect((await send(member, "both")).texts).toEqual(["both", "Done."]);
    expect(provider.credentials).toEqual([`Bearer ${TEAM_VALUE}`]);
    // Withdrawn: refused again, with no call.
    expect(await call("secret-keys", "offer-key", owner, { id: teamKey.id, offered: false })).toMatchObject({ ok: true });
    expect((await send(member, "withdrawn")).texts).toEqual(["withdrawn", NOT_OFFERED]);
    expect(provider.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("never lets a member offer someone else's key or choose the workspace's key, and an owner's choice of a member's key pays nothing until the member offers it", async () => {
    const { secretKeys, call, send, unlock, provider, teamKey } = await workspace();
    const mine = await secretKeys.createKey({ name: "Mine", value: MEMBER_VALUE, authorizationPassword: MEMBER_PASSWORD, provider: "Anthropic", createdBy: member.userId });
    await unlock(owner, OWNER_PASSWORD);
    await unlock(member, MEMBER_PASSWORD);
    expect(await call("secret-keys", "offer-key", member, { id: teamKey.id, offered: true })).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(await call("secret-keys", "set-default-key", member, { id: mine.id })).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(await call("secret-keys", "set-assistant-model", member, { keyId: mine.id })).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(await call("secret-keys", "offer-key", owner, { id: mine.id, offered: true })).toMatchObject({ ok: false, error: "Only the person who added a key can offer it to the workspace." });

    // An owner makes the member's key the default: chosen, not offered, so it pays for no one but the member.
    expect(await call("secret-keys", "set-default-key", owner, { id: mine.id })).toMatchObject({ ok: true });
    expect((await send(owner, "hello")).texts).toEqual(["hello", NOT_OFFERED]);
    expect(provider.fetchImpl).not.toHaveBeenCalled();
    expect((await send(member, "hello")).texts).toEqual(["hello", "Done."]);
    expect(provider.credentials).toEqual([`Bearer ${MEMBER_VALUE}`]);

    // The member offers it: now it pays for the owner's message too, on the member's own unlock.
    expect(await call("secret-keys", "offer-key", member, { id: mine.id, offered: true })).toMatchObject({ ok: true });
    expect((await send(owner, "again")).texts).toEqual(["again", "Done."]);
    expect(provider.credentials).toEqual([`Bearer ${MEMBER_VALUE}`, `Bearer ${MEMBER_VALUE}`]);
  });

  it("on local, the owner's own key answers the owner with nothing offered or chosen, as before", async () => {
    const { send, unlock, provider } = await workspace("local");
    await unlock(owner, OWNER_PASSWORD);
    expect((await send(owner, "hello")).texts).toEqual(["hello", "Done."]);
    expect(provider.credentials).toEqual([`Bearer ${TEAM_VALUE}`]);
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
