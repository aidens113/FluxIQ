// A holder offers their own key to the workspace (`offer-key`), through the
// real registry and Secret Keys' real handlers:
//
// - under `service`, a member offers and withdraws their own key; IAM decides
//   it on the key, so a member is refused another person's key, and the
//   service refuses an owner or administrator anyone's key but their own;
// - a paired browser's credential never makes the offer;
// - another person's key is chosen for the assistant only once its holder
//   offered it; the member still never chooses the workspace's key;
// - under `local`, the `admin` role offers its own key and `viewer` is refused.
//
// Dummy values only; the store is in memory.

import { describe, expect, it } from "vitest";
import { MemoryIamAuditSink, type IamPolicy, type IamPolicySource } from "../../../../platform/iam/index.ts";
import { IAM_ADMINISTRATOR_ACCESS, IAM_OWNER_FULL_ACCESS, IAM_USER_ACCESS } from "../../../../platform/iam/predefined/index.ts";
import { adminRole, viewerRole } from "../../../identity-access/index.ts";
import { GlobalProgramApiRegistry, type ProgramApiActor, type ProgramApiResponse } from "../../../_shared/api.ts";
import { actor, PAIRED_PERMISSIONS } from "../../../_shared/tests/iam-registry-fixtures.ts";
import type { ProgramApiIamOptions } from "../../../_shared/iam/index.ts";
import { SecretKeysService } from "../../runtime/service.ts";
import { WEAK_SCRYPT_PARAMETERS, createMemoryRepository } from "../../runtime/tests/secret-key-fixtures.ts";
import { registerSecretKeysApi } from "../handlers.ts";

const PASSWORD = "dummy-password";
const WORKSPACE = "workspace-main";

const owner = actor("owner", "admin", adminRole.permissions);
const administrator = actor("administrator", "admin", adminRole.permissions);
const member = actor("member", "user", ["programs.read", "programs.write", "secrets.manage"]);
const membersBrowser = actor("member", "user", PAIRED_PERMISSIONS, "paired-client");
const outsider = actor("outsider", "user", ["programs.read", "programs.write", "secrets.manage"]);

const POLICIES: Readonly<Record<string, readonly IamPolicy[]>> = { owner: [IAM_OWNER_FULL_ACCESS], administrator: [IAM_ADMINISTRATOR_ACCESS], member: [IAM_USER_ACCESS] };
const membership: IamPolicySource = {
  resolvePolicySet: async (principal) => ({ identity: POLICIES[principal.id] ?? [], guardrails: [], sessions: [], boundary: null }),
  getRole: async () => null
};

async function workspace(iam: ProgramApiIamOptions) {
  const audit = new MemoryIamAuditSink();
  const service = new SecretKeysService({ repository: createMemoryRepository().repository, passwordKdf: { testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS } });
  const registry = new GlobalProgramApiRegistry({ iam: { ...iam, workspaceId: WORKSPACE, audit } });
  registerSecretKeysApi(registry, service);
  const call = (endpoint: string, caller: ProgramApiActor, payload: Record<string, unknown> = {}) =>
    registry.call({ programId: "secret-keys", endpoint, scope: {}, actor: caller, payload }) as Promise<ProgramApiResponse<any>>;
  const add = (name: string, createdBy: string) => service.createKey({ name, value: `dummy-${name}`, authorizationPassword: PASSWORD, provider: "Anthropic", createdBy });
  const ownersKey = await add("Owner's key", owner.userId);
  const membersKey = await add("Member's key", member.userId);
  const decisions = (who: string, action: string) => audit.records.filter((record) => record.action === action && record.principal.endsWith(`:user/${who}`)).map((record) => record.decision);
  const offered = async (keyId: string) => (await service.snapshot()).keys.find((key) => key.id === keyId)?.offeredToWorkspace;
  return { service, call, decisions, offered, ownersKey, membersKey };
}

describe("offering a key to the workspace (service)", () => {
  it("is the holder's own act: a member offers and withdraws their own key", async () => {
    const { service, call, decisions, offered, membersKey } = await workspace({ profile: "service", source: membership });
    expect(await call("offer-key", member, { id: membersKey.id, offered: true })).toEqual({ ok: true, payload: { keyId: membersKey.id, offered: true } });
    expect(await offered(membersKey.id)).toBe(true);
    expect(await call("offer-key", member, { id: membersKey.id, offered: false })).toEqual({ ok: true, payload: { keyId: membersKey.id, offered: false } });
    expect(await offered(membersKey.id)).toBe(false);
    expect(decisions(member.userId, "secrets:OfferKey")).toEqual(["allow", "allow"]);
    expect(await call("offer-key", member, { id: membersKey.id })).toMatchObject({ ok: false, error: "id and offered are required" });
    service.close();
  });

  it("never offers another person's key: IAM refuses a member, and the service an owner or administrator", async () => {
    const { service, call, decisions, offered, ownersKey, membersKey } = await workspace({ profile: "service", source: membership });
    expect(await call("offer-key", member, { id: ownersKey.id, offered: true })).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(decisions(member.userId, "secrets:OfferKey")).toEqual(["deny"]);
    for (const chooser of [owner, administrator]) {
      expect(await call("offer-key", chooser, { id: membersKey.id, offered: true }), chooser.userId).toMatchObject({ ok: false, error: "Only the person who added a key can offer it to the workspace." });
    }
    expect(await offered(ownersKey.id)).toBe(false);
    expect(await offered(membersKey.id)).toBe(false);
    expect(await call("offer-key", outsider, { id: membersKey.id, offered: true })).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    service.close();
  });

  it("is never made from a paired browser", async () => {
    const { service, call, offered, membersKey } = await workspace({ profile: "service", source: membership });
    expect(await call("offer-key", membersBrowser, { id: membersKey.id, offered: true })).toMatchObject({ ok: false });
    expect(await offered(membersKey.id)).toBe(false);
    service.close();
  });

  it("lets an owner choose another person's key for the assistant only once its holder offered it; a member chooses nothing", async () => {
    const { service, call, membersKey } = await workspace({ profile: "service", source: membership });
    expect(await call("set-assistant-model", owner, { keyId: membersKey.id })).toMatchObject({ ok: false, error: "That key belongs to someone else, who has not offered it to this workspace." });
    expect(await call("offer-key", member, { id: membersKey.id, offered: true })).toMatchObject({ ok: true });
    const chosen = await call("set-assistant-model", owner, { keyId: membersKey.id });
    expect(chosen.ok, chosen.error).toBe(true);
    expect(chosen.payload).toMatchObject({ assistantKeyId: membersKey.id, assistantKeyChosen: true, assistantKeyOffered: true });
    // Offering one's own key never lets a member choose the workspace's key.
    expect(await call("set-default-key", member, { id: membersKey.id })).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(await call("set-assistant-model", member, { keyId: membersKey.id })).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    service.close();
  });

  it("lets an owner make another person's key the default only once its holder offered it, as for the assistant", async () => {
    const { service, call, membersKey } = await workspace({ profile: "service", source: membership });
    const before = await call("get-assistant-model", owner, {});
    expect(await call("set-default-key", owner, { id: membersKey.id })).toMatchObject({ ok: false, error: "That key belongs to someone else, who has not offered it to this workspace." });
    expect((await call("get-assistant-model", owner, {})).payload).toEqual(before.payload);
    expect(await call("offer-key", member, { id: membersKey.id, offered: true })).toMatchObject({ ok: true });
    const chosen = await call("set-default-key", owner, { id: membersKey.id });
    expect(chosen.ok, chosen.error).toBe(true);
    expect(chosen.payload).toMatchObject({ defaultKeyId: membersKey.id });
    service.close();
  });
});

describe("offering a key to the workspace (local)", () => {
  it("is open to the admin role for its own key and refused to the viewer role", async () => {
    const { service, call, offered, ownersKey } = await workspace({ profile: "local" });
    const viewer = actor("viewer", "viewer", viewerRole.permissions);
    expect(await call("offer-key", viewer, { id: ownersKey.id, offered: true })).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(await call("offer-key", owner, { id: ownersKey.id, offered: true })).toMatchObject({ ok: true });
    expect(await offered(ownersKey.id)).toBe(true);
    service.close();
  });
});
