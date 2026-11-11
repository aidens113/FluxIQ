// The workspace's default key and the assistant's key are the workspace's
// choices, decided on the workspace FRN, through the real registry and Secret
// Keys' real handlers:
//
// - under `service`, the owner (`FluxIQOwnerFullAccess`) and an administrator
//   (`FluxIQAdministratorAccess`) change them; a member (`FluxIQUserAccess`)
//   is refused, even for their own key, and nothing changes; a person outside
//   the workspace is refused;
// - a member still manages their own key (IAM allows it on the key);
// - under `local`, the `admin` role changes them and `viewer` is refused.
//
// Dummy values only; the store is in memory.

import { describe, expect, it } from "vitest";
import { iamWorkspaceFrn } from "../../../../platform/iam/frn/index.ts";
import { MemoryIamAuditSink, type IamPolicy, type IamPolicySource } from "../../../../platform/iam/index.ts";
import { IAM_ADMINISTRATOR_ACCESS, IAM_OWNER_FULL_ACCESS, IAM_USER_ACCESS } from "../../../../platform/iam/predefined/index.ts";
import { adminRole, viewerRole } from "../../../identity-access/index.ts";
import { GlobalProgramApiRegistry, type ProgramApiActor, type ProgramApiResponse } from "../../../_shared/api.ts";
import { actor, FIXTURE_PIN, pinAcceptingIdentityAccess } from "../../../_shared/tests/iam-registry-fixtures.ts";
import type { ProgramApiIamOptions } from "../../../_shared/iam/index.ts";
import { SecretKeysService } from "../../runtime/service.ts";
import { WEAK_SCRYPT_PARAMETERS, createMemoryRepository } from "../../runtime/tests/secret-key-fixtures.ts";
import { registerSecretKeysApi } from "../handlers.ts";

const PASSWORD = "dummy-password";
const MODEL = "claude-haiku-5-5";
const WORKSPACE = "workspace-main";

const owner = actor("owner", "admin", adminRole.permissions);
const administrator = actor("administrator", "admin", adminRole.permissions);
const member = actor("member", "user", ["programs.read", "programs.write", "secrets.manage"]);
const outsider = actor("outsider", "user", ["programs.read", "programs.write", "secrets.manage"]);

/** Each person's policies in this workspace; the outsider has no membership, so none. */
const POLICIES: Readonly<Record<string, readonly IamPolicy[]>> = { owner: [IAM_OWNER_FULL_ACCESS], administrator: [IAM_ADMINISTRATOR_ACCESS], member: [IAM_USER_ACCESS] };
const membership: IamPolicySource = {
  resolvePolicySet: async (principal) => ({ identity: POLICIES[principal.id] ?? [], guardrails: [], sessions: [], boundary: null }),
  getRole: async () => null
};

async function workspace(iam: ProgramApiIamOptions) {
  const audit = new MemoryIamAuditSink();
  const service = new SecretKeysService({ repository: createMemoryRepository().repository, passwordKdf: { testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS } });
  const registry = new GlobalProgramApiRegistry({ identityAccess: pinAcceptingIdentityAccess, iam: { ...iam, workspaceId: WORKSPACE, audit } });
  registerSecretKeysApi(registry, service);
  const call = (endpoint: string, caller: ProgramApiActor, payload: Record<string, unknown> = {}) =>
    registry.call({ programId: "secret-keys", endpoint, scope: {}, actor: caller, payload }) as Promise<ProgramApiResponse<any>>;
  const add = (name: string, createdBy: string) => service.createKey({ name, value: `dummy-${name}`, authorizationPassword: PASSWORD, provider: "Anthropic", createdBy });
  // The owner's key is the workspace's first, so it is the default.
  const ownersKey = await add("Owner's key", owner.userId);
  const ownersSecond = await add("Owner's second key", owner.userId);
  const membersKey = await add("Member's key", member.userId);
  const decisions = (who: string, action: string) => audit.records.filter((record) => record.action === action && record.principal.endsWith(`:user/${who}`));
  return { service, call, audit, decisions, ownersKey, ownersSecond, membersKey };
}

describe("the workspace's default and assistant key (service)", () => {
  it("are changed by the owner and by an administrator", async () => {
    const { service, call, ownersKey, ownersSecond, membersKey } = await workspace({ profile: "service", source: membership });
    expect((await service.modelKeys.read()).defaultKeyId).toBe(ownersKey.id);

    const byOwner = await call("set-default-key", owner, { id: ownersSecond.id });
    expect(byOwner.ok, byOwner.error).toBe(true);
    expect(byOwner.payload).toMatchObject({ defaultKeyId: ownersSecond.id });
    const byAdministrator = await call("set-default-key", administrator, { id: membersKey.id });
    expect(byAdministrator.ok, byAdministrator.error).toBe(true);
    expect(byAdministrator.payload).toMatchObject({ defaultKeyId: membersKey.id });

    const assistant = await call("set-assistant-model", owner, { keyId: ownersKey.id, model: MODEL });
    expect(assistant.ok, assistant.error).toBe(true);
    expect(assistant.payload).toMatchObject({ assistantKeyId: ownersKey.id, assistantModel: MODEL });
    const backToDefault = await call("set-assistant-model", administrator, {});
    expect(backToDefault.ok, backToDefault.error).toBe(true);
    expect(backToDefault.payload).toMatchObject({ assistantKeyId: null });
    service.close();
  });

  it("refuse a member, even for the member's own key, on the workspace, and nothing changes", async () => {
    const { service, call, decisions, ownersKey, membersKey } = await workspace({ profile: "service", source: membership });
    const chosen = await call("set-assistant-model", owner, { keyId: ownersKey.id, model: MODEL });
    expect(chosen.ok, chosen.error).toBe(true);
    const before = await service.modelKeys.read();

    for (const [endpoint, payload] of [
      ["set-default-key", { id: membersKey.id }],
      ["set-default-key", { id: ownersKey.id }],
      ["set-assistant-model", { keyId: membersKey.id }],
      ["set-assistant-model", { keyId: membersKey.id, model: MODEL }],
      ["set-assistant-model", {}]
    ] as const) {
      expect(await call(endpoint, member, payload), `${endpoint} ${JSON.stringify(payload)}`).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    }
    expect(await service.modelKeys.read()).toEqual(before);
    expect(before).toMatchObject({ defaultKeyId: ownersKey.id, assistantKeyId: ownersKey.id, assistantModel: MODEL });

    // Each refusal is IAM's, on the workspace FRN, never on the key.
    const workspaceFrn = iamWorkspaceFrn(WORKSPACE);
    for (const action of ["secrets:SetDefaultKey", "secrets:SetAssistantModel"]) {
      const rows = decisions(member.userId, action);
      expect(rows.length, action).toBeGreaterThan(0);
      for (const row of rows) expect({ decision: row.decision, resources: row.resources }, action).toEqual({ decision: "deny", resources: [workspaceFrn] });
    }
    service.close();
  });

  it("still let a member manage their own key: IAM allows each act on it", async () => {
    const { service, call, decisions, membersKey } = await workspace({ profile: "service", source: membership });
    const proof = { authSessionId: member.sessionId, authorizationPassword: "dummy-member-password", authorizationPin: FIXTURE_PIN, authorizationTotp: FIXTURE_PIN };
    for (const [endpoint, action, payload] of [
      ["update-key", "secrets:UpdateKey", { id: membersKey.id, name: "Renamed", ...proof }],
      ["rotate-key", "secrets:RotateKey", { id: membersKey.id, value: "dummy-rotated", ...proof }],
      ["reveal-key", "secrets:RevealKey", { id: membersKey.id, ...proof }],
      ["delete-key", "secrets:DeleteKey", { id: membersKey.id, ...proof }],
      ["create-key", "secrets:CreateKey", { name: "Another", value: "dummy-another", ...proof }]
    ] as const) {
      const answer = await call(endpoint, member, payload);
      // The handler then asks Identity Access for the password, which this registry has none of; IAM's part is what is pinned.
      expect(answer.errorCode, endpoint).not.toBe("authorization.forbidden");
      expect(decisions(member.userId, action).map((row) => row.decision), endpoint).toEqual(["allow"]);
    }
    service.close();
  });

  it("refuse a person outside the workspace", async () => {
    const { service, call, ownersKey } = await workspace({ profile: "service", source: membership });
    const before = await service.modelKeys.read();
    expect(await call("set-default-key", outsider, { id: ownersKey.id })).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(await call("set-assistant-model", outsider, {})).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(await service.modelKeys.read()).toEqual(before);
    service.close();
  });
});

describe("the workspace's default and assistant key (local)", () => {
  it("are changed by the admin role and refused to the viewer role", async () => {
    const { service, call, ownersSecond } = await workspace({ profile: "local" });
    const localAdmin = actor("owner", "admin", adminRole.permissions);
    const viewer = actor("viewer", "viewer", viewerRole.permissions);
    const before = await service.modelKeys.read();
    expect(await call("set-default-key", viewer, { id: ownersSecond.id })).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(await call("set-assistant-model", viewer, {})).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(await service.modelKeys.read()).toEqual(before);

    const set = await call("set-default-key", localAdmin, { id: ownersSecond.id });
    expect(set.ok, set.error).toBe(true);
    expect(set.payload).toMatchObject({ defaultKeyId: ownersSecond.id });
    const assistant = await call("set-assistant-model", localAdmin, { keyId: ownersSecond.id });
    expect(assistant.ok, assistant.error).toBe(true);
    service.close();
  });
});
