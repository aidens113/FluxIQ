// A member's own model key under the `service` profile, through the real registry, real IAM policies and Secret
// Keys' real handlers (t950):
//
// - a member (`FluxIQUserAccess`) saves, replaces and removes the key their own chats use, with no password, PIN,
//   code or confirmation, and reads Ready;
// - a member of another tenant cannot read, use or change it, and another member of the same workspace cannot
//   change it either;
// - a member's paired browser, decided by `FluxIQBrowserSession` over its person's policies (not by its legacy
//   `viewer` role), writes no key at all, its own person's included (t1095: keys are the panel's for every client,
//   user 2026-11-27), and still has model access: it reads readiness and its person's key is used for its calls;
// - the provider is asked BEFORE a key is stored (t950): a key it refuses, or whose account has no credit, is never
//   stored, so the person's previous key stays in use (or they keep no key), Activity reads a failed write of that
//   kind, and the panel's card keeps the typed key; an unreachable provider still lets the key be saved, and that
//   outcome is recorded on it, for the member; their paired browser is refused before the provider is asked;
// - saving never changes the workspace's assistant key or another member's access (F1); the first key saved into an
//   empty workspace becomes its key only when the saver may choose it (an owner, never a member or a browser), and
//   never in another tenant.
//
// Dummy values only; the store is in memory; no provider is asked.

import { describe, expect, it } from "vitest";
import type { ModelAccessState } from "@fluxiq/contracts/platform";
import type { IamPolicy, IamPolicySource } from "../../../../platform/iam/index.ts";
import { IAM_OWNER_FULL_ACCESS, IAM_USER_ACCESS } from "../../../../platform/iam/predefined/index.ts";
import { chooseAutomationStudioCallerModelKey } from "../../../../runtime/models/secrets/index.ts";
import { GlobalProgramApiRegistry, type ProgramApiActor, type ProgramApiResponse } from "../../../_shared/api.ts";
import { actor, recordingSink } from "../../../_shared/tests/iam-registry-fixtures.ts";
import { SecretKeysService } from "../../runtime/service.ts";
import { WEAK_SCRYPT_PARAMETERS, createMemoryRepository, hostProtectionOptions } from "../../runtime/tests/secret-key-fixtures.ts";
import type { SecretKeysSnapshot } from "../../types.ts";
import { registerSecretKeysApi } from "../handlers.ts";
import { scriptedKeyCheck } from "./scripted-key-check.ts";

const VALUE = "dummy-member-value";
const NEXT = "dummy-member-next";
const TEAM = "dummy-team-value";

/** Hosted members hold the identity role `viewer`; their panel calls are decided by policies alone. */
const owner = actor("owner", "admin", ["programs.read", "programs.write", "secrets.manage"]);
const alice = actor("alice", "viewer", ["programs.read"]);
const mia = actor("mia", "viewer", ["programs.read"]);
const bob = actor("bob", "viewer", ["programs.read"]);
/**
 * Alice's paired browser, as the route builds it for a hosted member: their legacy identity role is `viewer`, so the
 * token holds `programs.read` alone. Under `service` the gate decides it by Alice's policies narrowed by
 * `FluxIQBrowserSession` (t950), which the policy source below never attaches itself.
 */
const alicesBrowser: ProgramApiActor = { ...actor("alice", "viewer", ["programs.read"], "paired-client"), sessionId: "client-gateway:alice-browser" };

/** Memberships by workspace: a person has policies only in the workspace that holds their membership. */
function memberships(byWorkspace: Readonly<Record<string, Readonly<Record<string, readonly IamPolicy[]>>>>, sessions: readonly IamPolicy[] = []): IamPolicySource {
  return {
    resolvePolicySet: async (principal) => ({ identity: byWorkspace[principal.workspaceId ?? ""]?.[principal.id] ?? [], guardrails: [], sessions: [...sessions], boundary: null }),
    getRole: async () => null
  };
}

const TENANTS = memberships({ "ws-a": { owner: [IAM_OWNER_FULL_ACCESS], alice: [IAM_USER_ACCESS], mia: [IAM_USER_ACCESS] }, "ws-b": { bob: [IAM_USER_ACCESS] } });

function tenant(workspaceId: string, source: IamPolicySource = TENANTS) {
  const service = new SecretKeysService({ repository: createMemoryRepository().repository, passwordKdf: { testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS }, ...hostProtectionOptions() });
  const audit = recordingSink();
  const scripted = scriptedKeyCheck();
  const registry = new GlobalProgramApiRegistry({ iam: { profile: "service", workspaceId, source, audit } });
  const modelAccessOf = async (caller: ProgramApiActor, snapshot: SecretKeysSnapshot): Promise<ModelAccessState> => {
    const workspace = await service.modelKeys.resolveAssistant();
    const preferred = workspace.ok ? { keyId: workspace.keyId, model: workspace.model, ownerId: workspace.ownerId, chosenForWorkspace: workspace.chosenForWorkspace, offeredByHolder: workspace.offeredByHolder } : undefined;
    const choice = chooseAutomationStudioCallerModelKey({ keys: snapshot.keys, userId: caller.userId, preferred, ownKeyId: await service.modelKeys.personKeyId(caller.userId) });
    if (!choice.ok) return { status: choice.status, message: choice.message, key: null, lastCall: null };
    return { status: "ready", message: "Ready.", key: { id: choice.key.id, name: choice.key.name ?? choice.key.id, provider: choice.provider, model: choice.model }, lastCall: null };
  };
  registerSecretKeysApi(registry, service, undefined, () => ({ sessionId: null }), modelAccessOf, scripted.check);
  const call = (endpoint: string, caller: ProgramApiActor, payload: Record<string, unknown> = {}) =>
    registry.call({ programId: "secret-keys", endpoint, scope: {}, actor: caller, payload }) as Promise<ProgramApiResponse<any>>;
  const accessOf = async (caller: ProgramApiActor) => await modelAccessOf(caller, await service.snapshotFor({ userId: caller.userId, sessionId: null }));
  const keyOf = async (userId: string) => (await service.snapshot()).keys.find((key) => key.createdBy === userId);
  const outcomes = () => audit.records.filter((record) => record.outcome !== undefined).map((record) => record.outcome);
  return { service, registry, call, accessOf, keyOf, scripted, outcomes };
}

describe("a member's own model key (service)", () => {
  it("is saved, replaced and removed by the member from the panel with no password, PIN or code, and reads Ready", async () => {
    const { service, call, keyOf } = tenant("ws-a");
    const saved = await call("save-model-key", alice, { provider: "anthropic", value: VALUE, name: "Mine" });
    expect(saved.ok, saved.error).toBe(true);
    const key = await keyOf("alice");
    expect(key).toMatchObject({ name: "Mine", createdBy: "alice", kind: "llm" });
    expect(saved.payload.modelAccess).toMatchObject({ status: "ready", key: { id: key!.id, provider: "anthropic" } });

    const replaced = await call("replace-model-key", alice, { value: NEXT });
    expect(replaced.ok, replaced.error).toBe(true);
    expect((await service.snapshot()).keys.map((stored) => stored.id)).toEqual([key!.id]);

    const removed = await call("remove-model-key", alice);
    expect(removed).toMatchObject({ ok: true, payload: { modelAccess: { status: "no_key", key: null } } });
    expect((await service.snapshot()).keys).toEqual([]);
    for (const answer of [saved, replaced, removed]) expect(JSON.stringify(answer)).not.toMatch(/dummy-member-(value|next)/u);
    service.close();
  });

  it("is never read, used or changed by a member of another tenant", async () => {
    const a = tenant("ws-a");
    expect((await a.call("save-model-key", alice, { provider: "anthropic", value: VALUE })).ok).toBe(true);
    const key = (await a.keyOf("alice"))!;
    const before = await a.service.snapshot();

    // Bob is a member of ws-b, with the same policy there; in ws-a he holds nothing.
    for (const [endpoint, payload] of [
      ["snapshot", {}],
      ["save-model-key", { provider: "anthropic", value: "dummy-bob-value" }],
      ["replace-model-key", { value: "dummy-bob-value" }],
      ["remove-model-key", {}],
      ["update-key", { id: key.id, name: "Bob's now" }],
      ["rotate-key", { id: key.id, value: "dummy-bob-value" }],
      ["delete-key", { id: key.id }],
      ["reveal-key", { id: key.id }]
    ] as const) {
      expect(await a.call(endpoint, bob, payload), endpoint).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    }
    expect((await a.registry.authorize({ actor: bob, action: "secrets:UseKey", permission: "programs.write", resources: { kind: "key", keyId: key.id }, programId: "secret-keys" })).allowed).toBe(false);
    expect(await a.service.snapshot()).toEqual(before);

    // In his own tenant Bob saves his own key, which ws-a never sees.
    const b = tenant("ws-b");
    expect((await b.call("save-model-key", bob, { provider: "deepseek", value: "dummy-bob-value" })).ok).toBe(true);
    expect((await b.call("snapshot", bob)).payload.keys.map((stored: { createdBy?: string }) => stored.createdBy)).toEqual(["bob"]);
    expect(await a.service.snapshot()).toEqual(before);
    a.service.close();
    b.service.close();
  });

  it("is never changed by another member of the same workspace, whose own writes reach only their own key", async () => {
    const { service, call, keyOf, accessOf } = tenant("ws-a");
    expect((await call("save-model-key", alice, { provider: "anthropic", value: VALUE })).ok).toBe(true);
    const key = (await keyOf("alice"))!;
    for (const [endpoint, payload] of [["update-key", { id: key.id, name: "Mia's now" }], ["rotate-key", { id: key.id, value: "dummy-mia-value" }], ["delete-key", { id: key.id }], ["reveal-key", { id: key.id }]] as const) {
      expect(await call(endpoint, mia, payload), endpoint).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    }
    // Mia's replace and remove act on her own in-use key only; she has none, and Alice's is not hers to use.
    expect(await call("replace-model-key", mia, { value: "dummy-mia-value" })).toMatchObject({ ok: false });
    expect(await call("remove-model-key", mia)).toMatchObject({ ok: false });
    expect(await accessOf(mia)).toMatchObject({ status: "not_permitted" });
    expect((await call("save-model-key", mia, { provider: "deepseek", value: "dummy-mia-value" })).ok).toBe(true);
    expect(await keyOf("alice")).toEqual(key);
    expect(await accessOf(alice)).toMatchObject({ status: "ready", key: { id: key.id } });
    service.close();
  });

  it("makes an owner's first save into an empty workspace its key (t928), never another tenant's, and a member's never", async () => {
    const a = tenant("ws-a");
    const b = tenant("ws-b");
    const otherTenant = await b.service.modelKeys.read();
    expect((await a.call("save-model-key", owner, { provider: "anthropic", value: TEAM, name: "Owner's" })).ok).toBe(true);
    const ownersKey = (await a.keyOf("owner"))!;
    expect(await a.service.modelKeys.read()).toMatchObject({ assistantKeyId: ownersKey.id, assistantKeyChosen: true });
    expect(await b.service.modelKeys.read()).toEqual(otherTenant);
    // Bob, an owner nowhere and a member in ws-b, saves there: ws-b's choice stays empty, ws-a's stays the owner's.
    expect((await b.call("save-model-key", bob, { provider: "deepseek", value: "dummy-bob-value" })).ok).toBe(true);
    expect(await b.service.modelKeys.read()).toMatchObject({ assistantKeyId: null, assistantKeyChosen: false });
    expect(await a.service.modelKeys.read()).toMatchObject({ assistantKeyId: ownersKey.id, assistantKeyChosen: true });
    a.service.close();
    b.service.close();
  });

  it("is never the workspace's assistant key or model, nor moves another member's access, when saved (F1)", async () => {
    const { service, call, accessOf, keyOf } = tenant("ws-a");
    // A member's first save into an empty workspace is theirs alone: a member may not choose the workspace's key.
    const empty = await service.modelKeys.read();
    expect((await call("save-model-key", alice, { provider: "anthropic", value: VALUE })).ok).toBe(true);
    expect(await service.modelKeys.read()).toMatchObject({ assistantKeyId: empty.assistantKeyId, assistantModel: empty.assistantModel, assistantKeyChosen: false });
    expect(await call("remove-model-key", alice)).toMatchObject({ ok: true });

    // The owner chooses and offers the workspace's key; Mia, with none of her own, chats on it.
    const team = await call("create-key", owner, { name: "Team", value: TEAM, provider: "Anthropic", kind: "llm" });
    expect(team.ok, team.error).toBe(true);
    expect((await call("set-assistant-model", owner, { keyId: team.payload.id, model: "claude-haiku-5-5" })).ok).toBe(true);
    expect((await call("offer-key", owner, { id: team.payload.id, offered: true })).ok).toBe(true);
    const workspaceBefore = await service.modelKeys.read();
    expect(await accessOf(mia)).toMatchObject({ status: "ready", key: { id: team.payload.id } });

    expect((await call("save-model-key", alice, { provider: "deepseek", value: VALUE })).ok).toBe(true);
    expect(await service.modelKeys.read()).toEqual(workspaceBefore);
    expect(await accessOf(mia)).toMatchObject({ status: "ready", key: { id: team.payload.id } });
    expect(await accessOf(owner)).toMatchObject({ status: "ready", key: { id: team.payload.id } });
    expect(await accessOf(alice)).toMatchObject({ status: "ready", key: { id: (await keyOf("alice"))!.id } });
    expect(await call("remove-model-key", alice)).toMatchObject({ ok: true, payload: { modelAccess: { status: "ready", key: { id: team.payload.id } } } });
    expect(await service.modelKeys.read()).toEqual(workspaceBefore);
    service.close();
  });
});

describe("a member's paired browser and its person's own model key (service, FluxIQBrowserSession)", () => {
  const browsers = TENANTS;

  // t1095: the session policy no longer allows the person's own model-key writes (t950 did); keys are the panel's.
  it("writes no key, its own person's included, whatever its body names, and changes nothing", async () => {
    const { service, call, keyOf } = tenant("ws-a", browsers);
    expect((await call("save-model-key", alice, { provider: "anthropic", value: VALUE, name: "Alice's" })).ok).toBe(true);
    const alicesKey = (await keyOf("alice"))!;
    const before = await service.snapshot();
    for (const [endpoint, payload] of [
      ["save-model-key", { provider: "anthropic", value: NEXT }],
      ["replace-model-key", { value: NEXT }],
      ["remove-model-key", {}],
      ["create-key", { name: "Other", value: "dummy-other", kind: "llm", provider: "Anthropic" }],
      ["update-key", { id: alicesKey.id, name: "Renamed" }],
      ["rotate-key", { id: alicesKey.id, value: "dummy-other" }],
      ["delete-key", { id: alicesKey.id }],
      ["reveal-key", { id: alicesKey.id }],
      ["set-default-key", { id: alicesKey.id }],
      ["offer-key", { id: alicesKey.id, offered: true }],
      ["set-assistant-model", { keyId: alicesKey.id }]
    ] as const) {
      const answer = await call(endpoint, alicesBrowser, payload);
      expect(answer, endpoint).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
      expect(JSON.stringify(answer), endpoint).not.toContain(NEXT);
    }
    expect(await service.snapshot()).toEqual(before);
    expect(await service.modelKeys.personKeyId("alice")).toBe(alicesKey.id);
    service.close();
  });

  it("still has model access: it reads its person's readiness and may use its person's own key, never another's", async () => {
    const { service, call, keyOf, registry } = tenant("ws-a", browsers);
    expect((await call("save-model-key", alice, { provider: "anthropic", value: VALUE })).ok).toBe(true);
    expect((await call("save-model-key", { ...mia, channel: "panel" }, { provider: "anthropic", value: "dummy-mia-value" })).ok).toBe(true);
    const alicesKey = (await keyOf("alice"))!;
    const miasKey = (await keyOf("mia"))!;
    const snapshot = await call("snapshot", alicesBrowser);
    expect(snapshot.ok, snapshot.error).toBe(true);
    expect(snapshot.payload.modelAccess).toMatchObject({ status: "ready", key: { id: alicesKey.id } });
    const useKey = async (keyId: string) => (await registry.authorize({ actor: alicesBrowser, action: "secrets:UseKey", permission: "programs.write", resources: { kind: "key", keyId }, programId: "secret-keys" })).allowed;
    expect(await useKey(alicesKey.id)).toBe(true);
    expect(await useKey(miasKey.id)).toBe(false);
    service.close();
  });
});

describe("the free check runs before a member's key is stored (service, t950)", () => {
  const browsers = TENANTS;
  it("refuses a member's paired browser before the provider is asked, and stores nothing (t1095)", async () => {
    const { service, call, scripted, outcomes } = tenant("ws-a", browsers);
    scripted.answer({ outcome: "provider_unreachable" });
    for (const [endpoint, payload] of [["save-model-key", { provider: "anthropic", value: VALUE }], ["replace-model-key", { value: NEXT }]] as const) {
      expect(await call(endpoint, alicesBrowser, payload), endpoint).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    }
    expect((await service.snapshot()).keys).toEqual([]);
    expect(scripted.recorded).toEqual([]);
    expect(outcomes()).not.toContainEqual({ result: "succeeded" });
    service.close();
  });

  for (const [who, caller] of [["a member from the panel", alice]] as const) {
    describe(who, () => {
      it.each(["provider_refused", "no_credit"] as const)("stores nothing on %s when they had no key, and Activity reads a failed save of that kind", async (outcome) => {
        const { service, call, accessOf, scripted, outcomes } = tenant("ws-a", browsers);
        scripted.answer({ outcome });
        const answer = await call("save-model-key", caller, { provider: "anthropic", value: VALUE });
        expect(answer).toMatchObject({ ok: false, errorCode: outcome });
        expect(answer.error).toMatch(/so it was not saved/u);
        expect(JSON.stringify(answer)).not.toContain(VALUE);
        expect((await service.snapshot()).keys).toEqual([]);
        expect(await service.modelKeys.personKeyId("alice")).toBeUndefined();
        expect(await accessOf(alice)).toMatchObject({ status: "no_key" });
        expect(scripted.recorded).toEqual([]);
        expect(outcomes()).toEqual([{ result: "failed", errorKind: outcome }]);
        service.close();
      });

      it.each(["provider_refused", "no_credit"] as const)("leaves the previous key in use on %s, for a save and a replace alike", async (outcome) => {
        const { service, call, accessOf, keyOf, scripted, outcomes } = tenant("ws-a", browsers);
        expect((await call("save-model-key", caller, { provider: "anthropic", value: VALUE, name: "Working" })).ok).toBe(true);
        const working = (await keyOf("alice"))!;
        scripted.answer({ outcome });
        expect(await call("save-model-key", caller, { provider: "deepseek", value: NEXT, name: "Refused" })).toMatchObject({ ok: false, errorCode: outcome });
        const replaced = await call("replace-model-key", caller, { value: NEXT });
        expect(replaced).toMatchObject({ ok: false, errorCode: outcome });
        expect(replaced.error).toMatch(/so your key was not changed/u);
        expect((await service.snapshot()).keys).toEqual([expect.objectContaining({ id: working.id, name: "Working", lastRotatedAtMs: working.lastRotatedAtMs })]);
        expect(await service.modelKeys.personKeyId("alice")).toBe(working.id);
        expect(await accessOf(alice)).toMatchObject({ status: "ready", key: { id: working.id } });
        expect(outcomes()).toEqual([{ result: "succeeded" }, { result: "failed", errorKind: outcome }, { result: "failed", errorKind: outcome }]);
        service.close();
      });

      it("saves the key when the provider cannot be reached, and records that outcome on it", async () => {
        const { service, call, keyOf, scripted, outcomes } = tenant("ws-a", browsers);
        scripted.answer({ outcome: "provider_unreachable" });
        expect(await call("save-model-key", caller, { provider: "anthropic", value: VALUE })).toMatchObject({ ok: true });
        const key = (await keyOf("alice"))!;
        expect(await service.modelKeys.personKeyId("alice")).toBe(key.id);
        expect(scripted.recorded).toEqual([{ id: key.id, lastRotatedAtMs: key.lastRotatedAtMs, outcome: "provider_unreachable" }]);
        expect(outcomes()).toEqual([{ result: "succeeded" }]);
        service.close();
      });
    });
  }
});
