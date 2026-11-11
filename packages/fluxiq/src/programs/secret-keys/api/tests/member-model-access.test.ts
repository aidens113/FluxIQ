// Who reads which model the assistant uses, under the `service` IAM profile,
// through the real registry and Secret Keys' real handlers:
//
// - the workspace's owner, a member (`FluxIQUserAccess`) and a read-only
//   person (`FluxIQReadOnlyAccess`) each read the same answer from
//   `get-assistant-model`: which provider and model, never a key's value,
//   seal or name;
// - a member never reveals, changes, rotates, deletes or picks the owner's key,
//   never changes the assistant's choice, and lists only their own keys;
// - a person outside the workspace reads nothing.
//
// Dummy values only; the store is in memory.

import { describe, expect, it } from "vitest";
import type { IamPolicy, IamPolicySource } from "../../../../platform/iam/index.ts";
import { IAM_OWNER_FULL_ACCESS, IAM_READ_ONLY_ACCESS, IAM_USER_ACCESS } from "../../../../platform/iam/predefined/index.ts";
import { GlobalProgramApiRegistry, type ProgramApiActor, type ProgramApiResponse } from "../../../_shared/api.ts";
import { actor } from "../../../_shared/tests/iam-registry-fixtures.ts";
import { SecretKeysService } from "../../runtime/service.ts";
import { WEAK_SCRYPT_PARAMETERS, createMemoryRepository } from "../../runtime/tests/secret-key-fixtures.ts";
import { registerSecretKeysApi } from "../handlers.ts";

const PASSWORD = "dummy-owner-password";
const VALUE = "dummy-team-key-value";
const MODEL = "claude-haiku-5-5";

const owner = actor("owner", "admin", ["programs.read", "programs.write", "secrets.manage"]);
const member = actor("member", "user", ["programs.read", "programs.write", "secrets.manage"]);
const reader = actor("reader", "viewer", ["programs.read"]);
const outsider = actor("outsider", "user", ["programs.read", "programs.write", "secrets.manage"]);

/** Each person's policies in this workspace; the outsider has no membership, so none. */
const POLICIES: Readonly<Record<string, readonly IamPolicy[]>> = { owner: [IAM_OWNER_FULL_ACCESS], member: [IAM_USER_ACCESS], reader: [IAM_READ_ONLY_ACCESS] };
const membership: IamPolicySource = {
  resolvePolicySet: async (principal) => ({ identity: POLICIES[principal.id] ?? [], guardrails: [], sessions: [], boundary: null }),
  getRole: async () => null
};

async function workspace() {
  const service = new SecretKeysService({ repository: createMemoryRepository().repository, passwordKdf: { testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS } });
  const registry = new GlobalProgramApiRegistry({ iam: { profile: "service", source: membership } });
  registerSecretKeysApi(registry, service);
  const call = (endpoint: string, caller: ProgramApiActor, payload: Record<string, unknown> = {}) =>
    registry.call({ programId: "secret-keys", endpoint, scope: {}, actor: caller, payload }) as Promise<ProgramApiResponse<any>>;
  const key = await service.createKey({ name: "Team key", value: VALUE, authorizationPassword: PASSWORD, provider: "Anthropic", createdBy: owner.userId });
  return { service, call, key };
}

describe("reading the assistant's model (service)", () => {
  it("answers the owner, a member and a read-only person alike: the provider and model, never a value, seal or name", async () => {
    const { service, call, key } = await workspace();
    const chosen = await call("set-assistant-model", owner, { keyId: key.id, model: MODEL });
    expect(chosen.ok, chosen.error).toBe(true);

    const expected = { defaultKeyId: key.id, assistantKeyId: key.id, assistantModel: MODEL, assistantProvider: "Anthropic", assistantAllowanceUsd: null };
    for (const caller of [owner, member, reader]) {
      const answer = await call("get-assistant-model", caller);
      expect(answer, caller.userId).toEqual({ ok: true, payload: expected });
      const text = JSON.stringify(answer);
      for (const secret of [VALUE, "sealed", "ciphertext", "Team key", PASSWORD]) expect(text, `${caller.userId}: ${secret}`).not.toContain(secret);
    }
    service.close();
  });

  it("refuses a person outside the workspace", async () => {
    const { service, call } = await workspace();
    expect(await call("get-assistant-model", outsider)).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(await call("snapshot", outsider)).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    service.close();
  });

  it("never lets a member reveal, change, pick or list the owner's key, nor change the assistant's choice", async () => {
    const { service, call, key } = await workspace();
    const proof = { authSessionId: member.sessionId, authorizationPassword: "dummy-member-password", authorizationPin: "123456", authorizationTotp: "123456" };
    for (const [endpoint, payload] of [
      ["reveal-key", { id: key.id, ...proof }],
      ["update-key", { id: key.id, name: "Mine now", ...proof }],
      ["rotate-key", { id: key.id, value: "dummy-other", ...proof }],
      ["delete-key", { id: key.id, ...proof }],
      ["set-default-key", { id: key.id }],
      ["set-assistant-model", { keyId: key.id }],
      ["set-assistant-model", {}]
    ] as const) {
      const answer = await call(endpoint, member, payload);
      expect(answer, endpoint).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
      expect(JSON.stringify(answer)).not.toContain(VALUE);
    }
    // The member's own list holds none of the owner's keys; the model choice it carries names no value.
    const listed = await call("snapshot", member);
    expect(listed.ok, listed.error).toBe(true);
    expect(listed.payload.keys).toEqual([]);
    expect(JSON.stringify(listed)).not.toContain(VALUE);
    // Nothing changed.
    expect((await service.getKeySummary(key.id))?.name).toBe("Team key");
    service.close();
  });
});
