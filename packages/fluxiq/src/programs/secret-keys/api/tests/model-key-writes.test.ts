// Saving, replacing and removing the key a person's chats use, from a signed-in
// panel session or a paired client, through the real registry and Secret Keys'
// real handlers (t928):
//
// - IAM alone decides (`secrets.manage`): no password, PIN or authenticator
//   code is asked for, and a caller without the permission is refused;
// - each answer is the caller's model access after the change, without a key
//   id for a paired client, and never the value;
// - the host's free check runs on each new value of a model key;
// - only the caller's own in-use key is replaced or removed;
// - a save changes only the saver's own calls: the workspace's assistant key and
//   model stay as chosen, except that the first key saved into a workspace with
//   no assistant key becomes it, and removing the workspace's key leaves the
//   others with no key, never another person's (F1).
//
// The host's model-access reading chooses through the host's own chooser
// (`chooseAutomationStudioCallerModelKey`, fed the person's own choice and the
// workspace's), and words the answer simply. Dummy values only; the store is in
// memory.

import { describe, expect, it } from "vitest";
import type { ModelAccessState } from "@fluxiq/contracts/platform";
import { adminRole, viewerRole } from "../../../identity-access/index.ts";
import { GlobalProgramApiRegistry, type ProgramApiActor, type ProgramApiResponse } from "../../../_shared/api.ts";
import { actor, PAIRED_PERMISSIONS } from "../../../_shared/tests/iam-registry-fixtures.ts";
import { chooseAutomationStudioCallerModelKey } from "../../../../runtime/models/secrets/index.ts";
import { SecretKeysService } from "../../runtime/service.ts";
import { WEAK_SCRYPT_PARAMETERS, createMemoryRepository, hostProtectionOptions } from "../../runtime/tests/secret-key-fixtures.ts";
import type { SecretKeysSnapshot } from "../../types.ts";
import type { SecretKeySavedKeyCheck } from "../saved-key-check.ts";
import { registerSecretKeysApi } from "../handlers.ts";

const VALUE = "dummy-anthropic-value";
const NEXT = "dummy-replaced-value";
const DEEPSEEK = "dummy-deepseek-value";

const panel = actor("alice", "admin", adminRole.permissions);
const browser = { ...actor("alice", "admin", [...PAIRED_PERMISSIONS, "secrets.manage"], "paired-client"), sessionId: "client-gateway:alice-browser" };
const narrowBrowser = { ...actor("alice", "admin", PAIRED_PERMISSIONS, "paired-client"), sessionId: "client-gateway:alice-narrow" };
const viewer = actor("victor", "viewer", viewerRole.permissions);
const bob = actor("bob", "admin", adminRole.permissions);
const bobsBrowser = { ...actor("bob", "admin", [...PAIRED_PERMISSIONS, "secrets.manage"], "paired-client"), sessionId: "client-gateway:bob-browser" };
const mia = actor("mia", "member", PAIRED_PERMISSIONS);

function workspace() {
  const service = new SecretKeysService({ repository: createMemoryRepository().repository, passwordKdf: { testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS }, ...hostProtectionOptions() });
  const registry = new GlobalProgramApiRegistry({ iam: { profile: "local" } });
  const checked: Array<Parameters<SecretKeySavedKeyCheck>[0]> = [];
  const modelAccessOf = async (caller: ProgramApiActor, snapshot: SecretKeysSnapshot): Promise<ModelAccessState> => {
    const workspace = await service.modelKeys.resolveAssistant();
    const preferred = workspace.ok ? { keyId: workspace.keyId, model: workspace.model, ownerId: workspace.ownerId, chosenForWorkspace: workspace.chosenForWorkspace, offeredByHolder: workspace.offeredByHolder } : undefined;
    const choice = chooseAutomationStudioCallerModelKey({ keys: snapshot.keys, userId: caller.userId, preferred, ownKeyId: await service.modelKeys.personKeyId(caller.userId) });
    if (!choice.ok) return { status: choice.status, message: choice.status === "no_key" ? "Add a model key." : choice.message, key: null, lastCall: null };
    const key = choice.key;
    return { status: "ready", message: `Chats use the key “${key.name}”.`, key: { id: key.id, name: key.name ?? key.id, provider: choice.provider, model: `${choice.provider}-default` }, lastCall: null };
  };
  /** What a person's calls use now, as the host reads it (key id included). */
  const accessOf = async (caller: ProgramApiActor) => await modelAccessOf(caller, await service.snapshotFor({ userId: caller.userId, sessionId: null }));
  registerSecretKeysApi(registry, service, undefined, () => ({ sessionId: null }), modelAccessOf, async (key) => {
    checked.push(key);
  });
  const call = (endpoint: string, caller: ProgramApiActor, payload: Record<string, unknown> = {}) =>
    registry.call({ programId: "secret-keys", endpoint, scope: {}, actor: caller, payload }) as Promise<ProgramApiResponse<any>>;
  return { service, call, checked, accessOf };
}

describe("the key a person's chats use, written from a client with no password", () => {
  it("is saved, replaced and removed from a paired client by IAM alone, and the client is never handed a key id or value", async () => {
    const { service, call, checked } = workspace();

    const saved = await call("save-model-key", browser, { provider: "anthropic", value: VALUE });
    expect(saved.ok, saved.error).toBe(true);
    expect(saved.payload.modelAccess).toMatchObject({ status: "ready", key: { name: "Anthropic key", provider: "anthropic" } });
    expect(saved.payload.modelAccess.key).not.toHaveProperty("id");
    const [key] = (await service.snapshot()).keys;
    expect(key).toMatchObject({ name: "Anthropic key", provider: "Anthropic", kind: "llm", createdBy: "alice" });
    expect(checked).toEqual([{ id: key!.id, provider: "anthropic", value: VALUE, lastRotatedAtMs: key!.lastRotatedAtMs }]);

    const replaced = await call("replace-model-key", browser, { value: NEXT });
    expect(replaced.ok, replaced.error).toBe(true);
    expect(replaced.payload.modelAccess.key).not.toHaveProperty("id");
    expect(checked[1]).toMatchObject({ id: key!.id, provider: "anthropic", value: NEXT });
    expect(((await service.snapshot()).keys[0])?.lastRotatedAtMs).toBe(checked[1]?.lastRotatedAtMs);

    const removed = await call("remove-model-key", browser);
    expect(removed).toEqual({ ok: true, payload: { modelAccess: { status: "no_key", message: "Add a model key.", key: null, lastCall: null } } });
    expect((await service.snapshot()).keys).toEqual([]);

    for (const answer of [saved, replaced, removed]) {
      const text = JSON.stringify(answer);
      for (const secret of [VALUE, NEXT, key!.id]) expect(text).not.toContain(secret);
    }
    service.close();
  });

  it("tells a panel session the key's id, and needs no password, PIN or authenticator code from it either", async () => {
    const { service, call } = workspace();
    const saved = await call("save-model-key", panel, { provider: "deepseek", value: DEEPSEEK, name: "  Work  " });
    expect(saved.ok, saved.error).toBe(true);
    const [key] = (await service.snapshot()).keys;
    expect(saved.payload.modelAccess.key).toEqual({ id: key!.id, name: "Work", provider: "deepseek", model: "deepseek-default" });
    expect(await call("replace-model-key", panel, { value: NEXT })).toMatchObject({ ok: true });
    expect(await call("remove-model-key", panel)).toMatchObject({ ok: true, payload: { modelAccess: { status: "no_key" } } });
    service.close();
  });

  it("is refused by IAM to a caller without secrets.manage, whichever way they connect, and nothing changes", async () => {
    const { service, call, checked } = workspace();
    for (const caller of [narrowBrowser, viewer]) {
      for (const [endpoint, payload] of [["save-model-key", { provider: "anthropic", value: VALUE }], ["replace-model-key", { value: NEXT }], ["remove-model-key", {}]] as const) {
        expect(await call(endpoint, caller, payload), `${caller.userId} ${endpoint}`).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
      }
    }
    expect((await service.snapshot()).keys).toEqual([]);
    expect(checked).toEqual([]);
    service.close();
  });

  it("makes a person's first save, alone in the workspace, its key at once, and a later save theirs alone", async () => {
    const { service, call } = workspace();
    const first = await call("save-model-key", panel, { provider: "anthropic", value: VALUE, name: "First" });
    expect(first.payload.modelAccess).toMatchObject({ status: "ready", key: { name: "First", provider: "anthropic" } });
    const firstId = (await service.snapshot()).keys.find((key) => key.name === "First")!.id;
    expect(await service.modelKeys.read()).toMatchObject({ assistantKeyId: firstId, assistantKeyChosen: true });

    const second = await call("save-model-key", panel, { provider: "deepseek", value: DEEPSEEK, name: "Second" });
    expect(second.payload.modelAccess.key).toMatchObject({ name: "Second", provider: "deepseek" });
    // The caller's own calls use the key they just saved; the workspace's key stays the one it had.
    expect(await service.modelKeys.read()).toMatchObject({ assistantKeyId: firstId, assistantKeyChosen: true });
    service.close();
  });

  it("refuses in plain words to replace or remove when no key is in use, or when the key in use is lent by someone else", async () => {
    const { service, call } = workspace();
    expect(await call("replace-model-key", browser, { value: NEXT })).toEqual({ ok: false, error: "Your chats use no model key yet, so there is none to replace. Save a key first." });
    expect(await call("remove-model-key", browser)).toEqual({ ok: false, error: "Your chats use no model key, so there is none to remove." });

    // Bob's key, chosen for the workspace and offered by Bob: Alice's chats use it, and it stays Bob's.
    await call("save-model-key", bob, { provider: "anthropic", value: VALUE, name: "Bob's key" });
    const bobsKey = (await service.snapshot()).keys[0]!;
    await service.modelKeys.setDefault(bobsKey.id, "bob");
    await service.modelKeys.setOffered(bobsKey.id, true, "bob");
    expect((await call("save-model-key", panel, { provider: "anthropic", value: "" }))).toEqual({ ok: false, error: "value is required" });
    expect(await call("replace-model-key", browser, { value: NEXT })).toEqual({ ok: false, error: "The key your chats use belongs to someone else, so only they can replace it. Save your own key instead." });
    expect(await call("remove-model-key", browser)).toEqual({ ok: false, error: "The key your chats use belongs to someone else, so only they can remove it." });
    expect((await service.snapshot()).keys.map((key) => key.id)).toEqual([bobsKey.id]);
    expect((await service.snapshot()).keys[0]?.lastRotatedAtMs).toBe(bobsKey.lastRotatedAtMs);
    service.close();
  });

  it("refuses a provider it cannot run and a missing value before anything is saved", async () => {
    const { service, call } = workspace();
    expect(await call("save-model-key", browser, { provider: "openai", value: VALUE })).toEqual({ ok: false, error: 'provider must be "anthropic" or "deepseek"' });
    expect(await call("save-model-key", browser, { provider: "anthropic" })).toEqual({ ok: false, error: "value is required" });
    expect(await call("replace-model-key", browser, {})).toEqual({ ok: false, error: "value is required" });
    expect((await service.snapshot()).keys).toEqual([]);
    service.close();
  });
});

describe("one person's key write never moves another person's key (F1)", () => {
  /** Alice saved the workspace's first key, chose its model and offered it: Mia, with no key of her own, chats on it. */
  async function team() {
    const setup = workspace();
    expect((await setup.call("save-model-key", panel, { provider: "anthropic", value: VALUE, name: "Team" })).ok).toBe(true);
    const teamKey = (await setup.service.snapshot()).keys[0]!;
    await setup.service.modelKeys.setAssistant({ keyId: teamKey.id, model: "claude-haiku-5-5", chosenBy: "alice" });
    await setup.service.modelKeys.setOffered(teamKey.id, true, "alice");
    expect(await setup.accessOf(mia)).toMatchObject({ status: "ready", key: { id: teamKey.id } });
    return { ...setup, teamKey, workspaceBefore: await setup.service.modelKeys.read() };
  }

  it("leaves the workspace's key and model alone when another administrator saves, from the panel or a paired client, and the member keeps working", async () => {
    const { service, call, accessOf, teamKey, workspaceBefore } = await team();
    for (const [caller, name] of [[bob, "Bob's panel key"], [bobsBrowser, "Bob's browser key"]] as const) {
      const saved = await call("save-model-key", caller, { provider: "deepseek", value: DEEPSEEK, name });
      expect(saved.ok, saved.error).toBe(true);
      expect(saved.payload.modelAccess).toMatchObject({ status: "ready", key: { name, provider: "deepseek" } });
      expect(await service.modelKeys.read(), name).toEqual(workspaceBefore);
      expect(await service.modelKeys.resolveAssistant()).toMatchObject({ ok: true, keyId: teamKey.id, model: "claude-haiku-5-5", chosenForWorkspace: true, offeredByHolder: true });
      expect(await accessOf(mia), name).toMatchObject({ status: "ready", key: { id: teamKey.id } });
      expect(await accessOf(panel), name).toMatchObject({ status: "ready", key: { id: teamKey.id } });
      expect(await accessOf(bob), name).toMatchObject({ status: "ready", key: { name, provider: "deepseek" } });
    }
    service.close();
  });

  it("replaces and removes a person's own key without touching anyone else's choice", async () => {
    const { service, call, accessOf, teamKey, workspaceBefore } = await team();
    await call("save-model-key", bob, { provider: "deepseek", value: DEEPSEEK, name: "Bob's" });
    const bobsKey = (await service.snapshot()).keys.find((key) => key.name === "Bob's")!;

    expect(await call("replace-model-key", bob, { value: NEXT })).toMatchObject({ ok: true, payload: { modelAccess: { key: { id: bobsKey.id } } } });
    expect(await service.modelKeys.read()).toEqual(workspaceBefore);
    expect(await accessOf(mia)).toMatchObject({ status: "ready", key: { id: teamKey.id } });

    // Bob's own key goes: his calls fall back to the workspace's lent key, and nobody else's change.
    expect(await call("remove-model-key", bob)).toMatchObject({ ok: true, payload: { modelAccess: { status: "ready", key: { id: teamKey.id } } } });
    expect(await service.modelKeys.read()).toEqual(workspaceBefore);
    expect(await service.modelKeys.personKeyId("alice")).toBe(teamKey.id);
    expect(await accessOf(mia)).toMatchObject({ status: "ready", key: { id: teamKey.id } });
    service.close();
  });

  it("leaves the others with no key when the workspace's key is removed, never another person's key", async () => {
    const { service, call, accessOf } = await team();
    await call("save-model-key", bob, { provider: "deepseek", value: DEEPSEEK, name: "Bob's" });
    const bobsKey = (await service.snapshot()).keys.find((key) => key.name === "Bob's")!;
    // Bob offers his key too, but nobody chose it for the workspace.
    await service.modelKeys.setOffered(bobsKey.id, true, "bob");

    expect(await call("remove-model-key", panel)).toMatchObject({ ok: true, payload: { modelAccess: { status: "no_key" } } });
    expect(await service.modelKeys.resolveAssistant()).toMatchObject({ ok: false });
    expect(await accessOf(mia)).toEqual({ status: "no_key", message: "Add a model key.", key: null, lastCall: null });
    expect(await accessOf(panel)).toMatchObject({ status: "no_key" });
    expect(await accessOf(bob)).toMatchObject({ status: "ready", key: { id: bobsKey.id } });
    service.close();
  });
});

describe("create-key, update-key, rotate-key and delete-key", () => {
  it("run on IAM alone from a panel session and a paired client, answering the caller's model access and checking each model key's new value", async () => {
    const { service, call, checked } = workspace();
    const created = await call("create-key", browser, { name: "Work", value: VALUE, provider: "Anthropic", kind: "llm" });
    expect(created.ok, created.error).toBe(true);
    expect(created.payload).toMatchObject({ name: "Work", createdBy: "alice", modelAccess: { status: "ready" } });
    expect(created.payload.modelAccess.key).not.toHaveProperty("id");
    const id = created.payload.id as string;
    expect(checked).toEqual([{ id, provider: "anthropic", value: VALUE, lastRotatedAtMs: created.payload.lastRotatedAtMs }]);

    const rotated = await call("rotate-key", panel, { id, value: NEXT });
    expect(rotated.payload).toMatchObject({ id, modelAccess: { key: { id } } });
    expect(checked[1]).toMatchObject({ id, value: NEXT });
    expect(await call("update-key", browser, { id, name: "Renamed" })).toMatchObject({ ok: true, payload: { name: "Renamed" } });

    // A key no model call reaches is never sent to a provider's check.
    const custom = await call("create-key", panel, { name: "Webhook", value: "dummy-webhook", kind: "custom" });
    expect(custom.ok, custom.error).toBe(true);
    expect(checked).toHaveLength(2);

    expect(await call("delete-key", browser, { id })).toEqual({ ok: true, payload: { deleted: true } });
    expect(JSON.stringify([created, rotated])).not.toContain(VALUE);
    expect(await call("create-key", narrowBrowser, { name: "Nope", value: VALUE })).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    service.close();
  });
});
